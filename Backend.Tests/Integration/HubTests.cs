using System.Net;
using Backend.Tests.Helpers;
using Microsoft.AspNetCore.SignalR.Client;

namespace Backend.Tests.Integration;

public class HubTests : IntegrationTestBase
{
    public HubTests(TestWebApplicationFactory factory) : base(factory)
    {
    }

    //CONNECTING
    [Fact]
    public async Task Connect_WithoutToken_IsRefused()
    {
        //arrange
        await using HubConnection connection = HubTestClient.CreateConnection(factory, null);

        //act
        HttpRequestException exception = await Assert.ThrowsAsync<HttpRequestException>(() => connection.StartAsync(TestContext.Current.CancellationToken));

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, exception.StatusCode);
    }

    //PRESENCE
    [Fact]
    public async Task Connect_TellsFriendsYouAreOnlineAndDisconnect_TellsThemYouAreOffline()
    {
        //arrange
        (string tokenA, string tokenB) = await RegisterTwoUsers("hbpresA", "hbpresB");
        await EstablishFriendship(tokenA, "hbpresA", tokenB, "hbpresB");
        await using HubTestClient hubA = await HubTestClient.Connect(factory, tokenA);

        //act
        HubTestClient hubB = await HubTestClient.Connect(factory, tokenB);
        object?[] onlineEvent = await hubA.Next("UserStatusChanged");
        await hubB.Disconnect();
        object?[] offlineEvent = await hubA.Next("UserStatusChanged");
        await hubB.DisposeAsync();

        //assert
        Assert.Equal(new object?[] { "hbpresB", ActivityStatus.online }, onlineEvent);
        Assert.Equal(new object?[] { "hbpresB", ActivityStatus.offline }, offlineEvent);
    }

    [Fact]
    public async Task Disconnect_WithAnotherTabStillOpen_StaysOnline()
    {
        //arrange
        (string tokenA, string tokenB) = await RegisterTwoUsers("hbtabsA", "hbtabsB");
        await EstablishFriendship(tokenA, "hbtabsA", tokenB, "hbtabsB");
        await using HubTestClient hubA = await HubTestClient.Connect(factory, tokenA);
        await using HubTestClient firstTabB = await HubTestClient.Connect(factory, tokenB);
        await using HubTestClient secondTabB = await HubTestClient.Connect(factory, tokenB);
        await hubA.Next("UserStatusChanged");

        //act
        await firstTabB.Disconnect();

        //assert: no offline, and the second tab didn't announce online again either
        await hubA.AssertNoEvent("UserStatusChanged");
        await secondTabB.Disconnect();
        Assert.Equal(new object?[] { "hbtabsB", ActivityStatus.offline }, await hubA.Next("UserStatusChanged"));
    }

    [Fact]
    public async Task Connect_WhenStatusIsOffline_DoesNotAnnounceOnline()
    {
        //arrange
        (string tokenA, string tokenB) = await RegisterTwoUsers("hbinvisA", "hbinvisB");
        await EstablishFriendship(tokenA, "hbinvisA", tokenB, "hbinvisB");
        await Send(HttpMethod.Put, "/users/me/status", tokenB, new UpdateStatusRequest { newStatus = ActivityStatus.offline });
        await using HubTestClient hubA = await HubTestClient.Connect(factory, tokenA);

        //act
        await using HubTestClient hubB = await HubTestClient.Connect(factory, tokenB);

        //assert
        await hubA.AssertNoEvent("UserStatusChanged");
    }

    //TYPING
    [Fact]
    public async Task StartChannelTyping_ReachesOtherMembersButNotTheTyper()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("hbtypeowner", "hbtypemember");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);
        await using HubTestClient memberHub = await HubTestClient.Connect(factory, memberToken);

        //act
        await memberHub.Invoke("StartChannelTyping", channelId);

        //assert
        Assert.Equal(new object?[] { channelId, "hbtypemember", "hbtypemember" }, await ownerHub.Next("ChannelTyping"));
        await memberHub.AssertNoEvent("ChannelTyping");
    }

    [Fact]
    public async Task StartChannelTyping_FromNonMember_IsIgnored()
    {
        //arrange
        (string ownerToken, long serverId) = await CreateServerAndGetId("hbtypenmowner");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        string outsiderToken = await RegisterAndGetToken("hbtypenmout");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);
        await using HubTestClient outsiderHub = await HubTestClient.Connect(factory, outsiderToken);

        //act
        await outsiderHub.Invoke("StartChannelTyping", channelId);

        //assert
        await ownerHub.AssertNoEvent("ChannelTyping");
    }

    [Fact]
    public async Task StartConversationTyping_ReachesTheOtherMember()
    {
        //arrange
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("hbdmtypeA", "hbdmtypeB");
        await using HubTestClient hubA = await HubTestClient.Connect(factory, tokenA);
        await using HubTestClient hubB = await HubTestClient.Connect(factory, tokenB);

        //act
        await hubB.Invoke("StartConversationTyping", conversationId);

        //assert
        Assert.Equal(new object?[] { conversationId, "hbdmtypeB", "hbdmtypeB" }, await hubA.Next("ConversationTyping"));
    }

    //CHANNEL MESSAGES
    [Fact]
    public async Task SendMessage_ReachesServerMembersWithTheMessage()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("hbmsgowner", "hbmsgmember");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);

        //act
        long messageId = await SendMessage(memberToken, channelId, "Hello everyone");

        //assert
        object?[] arguments = await ownerHub.Next("ReceiveChannelMessage");
        Assert.Equal(serverId, arguments[0]);
        Assert.Equal(channelId, arguments[1]);
        SendMessageResult message = Assert.IsType<SendMessageResult>(arguments[2]);
        Assert.Equal(messageId, message.id);
        Assert.Equal("Hello everyone", message.messageText);
        Assert.Equal("hbmsgmember", message.senderUsername);
    }

    [Fact]
    public async Task EditAndDeleteMessage_ReachServerMembers()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("hbeditowner", "hbeditmember");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        long messageId = await SendMessage(memberToken, channelId, "First draft");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);

        //act
        await Send(HttpMethod.Patch, $"/messages/{messageId}", memberToken, new EditMessageRequest { messageText = "Final draft" });
        object?[] editedEvent = await ownerHub.Next("ChannelMessageEdited");
        await Send(HttpMethod.Delete, $"/messages/{messageId}", memberToken);
        object?[] deletedEvent = await ownerHub.Next("ChannelMessageDeleted");

        //assert
        Assert.Equal(new object?[] { channelId, messageId, "Final draft" }, editedEvent);
        Assert.Equal(new object?[] { channelId, messageId }, deletedEvent);
    }

    [Fact]
    public async Task SendMessage_DoesNotReachNonMembers()
    {
        //arrange
        (string ownerToken, long serverId) = await CreateServerAndGetId("hbnmmsgowner");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        string outsiderToken = await RegisterAndGetToken("hbnmmsgout");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);
        await using HubTestClient outsiderHub = await HubTestClient.Connect(factory, outsiderToken);

        //act
        await SendMessage(ownerToken, channelId, "Members only");

        //assert
        await ownerHub.Next("ReceiveChannelMessage");
        await outsiderHub.AssertNoEvent("ReceiveChannelMessage");
    }

    //MEMBERSHIP
    [Fact]
    public async Task KickUser_TellsTheKickedUserAndStopsTheirEvents()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("hbkickowner", "hbkickmember");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);
        await using HubTestClient memberHub = await HubTestClient.Connect(factory, memberToken);

        //act
        await Send(HttpMethod.Delete, $"/servers/{serverId}/members/hbkickmember", ownerToken);
        object?[] kickedEvent = await memberHub.Next("MemberKicked");
        await SendMessage(ownerToken, channelId, "After the kick");

        //assert
        Assert.Equal(new object?[] { serverId, "hbkickmember" }, kickedEvent);
        await ownerHub.Next("ReceiveChannelMessage");
        await memberHub.AssertNoEvent("ReceiveChannelMessage");
    }

    [Fact]
    public async Task JoinServer_WhileConnected_StartsReceivingItsEvents()
    {
        //arrange
        (string ownerToken, long serverId) = await CreateServerAndGetId("hbjoinowner");
        long channelId = await CreateChannel(ownerToken, serverId, "general");
        string joinerToken = await RegisterAndGetToken("hbjoinmember");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);
        await using HubTestClient joinerHub = await HubTestClient.Connect(factory, joinerToken);

        //act
        await JoinServer(ownerToken, serverId, joinerToken);
        await SendMessage(ownerToken, channelId, "Welcome");

        //assert
        ServerResult joinedServer = Assert.IsType<ServerResult>((await joinerHub.Next("ServerJoined"))[0]);
        Assert.Equal(serverId, joinedServer.serverID);
        object?[] memberJoinedEvent = await ownerHub.Next("MemberJoined");
        Assert.Equal("hbjoinmember", Assert.IsType<UserResult>(memberJoinedEvent[1]).username);
        SendMessageResult message = Assert.IsType<SendMessageResult>((await joinerHub.Next("ReceiveChannelMessage"))[2]);
        Assert.Equal("Welcome", message.messageText);
    }

    [Fact]
    public async Task LeaveServer_AsOwner_TellsMembersTheNewOwner()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("hbownerleave", "hbownerleavemem");
        await using HubTestClient memberHub = await HubTestClient.Connect(factory, memberToken);

        //act
        await Send(HttpMethod.Delete, $"/servers/{serverId}/members/me", ownerToken);

        //assert
        Assert.Equal(new object?[] { serverId, "hbownerleavemem" }, await memberHub.Next("OwnerChanged"));
    }

    //CONVERSATIONS
    [Fact]
    public async Task SendConversationMessage_ReachesTheOtherMember()
    {
        //arrange
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("hbdmA", "hbdmB");
        await using HubTestClient hubB = await HubTestClient.Connect(factory, tokenB);

        //act
        long messageId = await SendConversationMessage(tokenA, conversationId, "Hi B");

        //assert
        object?[] arguments = await hubB.Next("ReceiveConversationMessage");
        Assert.Equal(conversationId, arguments[0]);
        SendMessageResult message = Assert.IsType<SendMessageResult>(arguments[1]);
        Assert.Equal(messageId, message.id);
        Assert.Equal("Hi B", message.messageText);
    }

    [Fact]
    public async Task LeaveConversation_TellsRemainingMembers()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("hbgrpowner", new List<string> { "hbgrpleaver", "hbgrpstayer" });
        string leaverToken = await Login("hbgrpleaver");
        await using HubTestClient ownerHub = await HubTestClient.Connect(factory, ownerToken);

        //act
        await Send(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", leaverToken);

        //assert
        Assert.Equal(new object?[] { conversationId, "hbgrpleaver" }, await ownerHub.Next("ConversationMemberLeft"));
    }
}
