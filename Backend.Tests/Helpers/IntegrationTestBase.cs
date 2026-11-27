using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Messaging_App.Data;
using Microsoft.Extensions.DependencyInjection;

namespace Backend.Tests.Helpers;

// setup helpers shared by the integration tests; each one fails the test straight away if its request doesn't succeed,
// so a broken setup step doesn't show up later as a confusing assertion
public abstract class IntegrationTestBase : IClassFixture<TestWebApplicationFactory>
{
    public const string TestPassword = "Test123!";

    protected readonly TestWebApplicationFactory factory;
    protected readonly HttpClient client;

    protected IntegrationTestBase(TestWebApplicationFactory factory)
    {
        this.factory = factory;
        client = factory.CreateClient();
    }

    protected static CancellationToken CancellationToken => TestContext.Current.CancellationToken;

    protected static HttpRequestMessage CreateRequest(HttpMethod method, string url, string token, object? body = null)
    {
        HttpRequestMessage request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        if (body != null)
        {
            request.Content = JsonContent.Create(body);
        }

        return request;
    }

    protected async Task<HttpResponseMessage> Send(HttpMethod method, string url, string token, object? body = null)
    {
        return await client.SendAsync(CreateRequest(method, url, token, body), CancellationToken);
    }

    // for follow-up checks after the action under test
    protected async Task<T> GetJson<T>(string url, string token)
    {
        HttpResponseMessage response = await Send(HttpMethod.Get, url, token);
        await AssertSuccess(response);

        T? result = await response.Content.ReadFromJsonAsync<T>(CancellationToken);
        Assert.NotNull(result);

        return result;
    }

    protected async Task<HttpStatusCode> GetStatus(string url, string token)
    {
        HttpResponseMessage response = await Send(HttpMethod.Get, url, token);

        return response.StatusCode;
    }

    protected static async Task AssertSuccess(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            string body = await response.Content.ReadAsStringAsync();
            Assert.Fail($"{response.RequestMessage?.Method} {response.RequestMessage?.RequestUri} returned {(int)response.StatusCode}: {body}");
        }
    }

    // reads and writes rows directly, for checks the API doesn't expose
    protected async Task<TResult> WithDatabase<TResult>(Func<MessagingAppContext, Task<TResult>> work)
    {
        await using AsyncServiceScope scope = factory.Services.CreateAsyncScope();
        MessagingAppContext db = scope.ServiceProvider.GetRequiredService<MessagingAppContext>();

        return await work(db);
    }

    //USERS
    protected async Task<AuthResult> Register(string username)
    {
        RegisterRequest request = new RegisterRequest
        {
            username = username,
            email = $"{username}@email.com",
            password = TestPassword
        };

        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, CancellationToken);
        await AssertSuccess(response);

        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(CancellationToken);
        Assert.NotNull(result);

        return result;
    }

    protected async Task<string> RegisterAndGetToken(string username, string email)
    {
        RegisterRequest request = new RegisterRequest
        {
            username = username,
            email = email,
            password = TestPassword
        };

        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, CancellationToken);
        await AssertSuccess(response);

        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(CancellationToken);

        return result!.accessToken;
    }

    protected async Task<string> RegisterAndGetToken(string username)
    {
        return await RegisterAndGetToken(username, $"{username}@email.com");
    }

    // for a user a helper registered without handing back their token
    protected async Task<string> Login(string username)
    {
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/login", new LoginRequest { username = username, password = TestPassword }, CancellationToken);
        await AssertSuccess(response);

        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(CancellationToken);

        return result!.accessToken;
    }

    protected async Task<(string tokenA, string tokenB)> RegisterTwoUsers(string usernameA, string usernameB)
    {
        string tokenA = await RegisterAndGetToken(usernameA);
        string tokenB = await RegisterAndGetToken(usernameB);

        return (tokenA, tokenB);
    }

    //FRIENDS
    protected async Task SendFriendRequest(string senderToken, string receiverUsername)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, "/friends/requests", senderToken, new SendFriendRequestRequest { username = receiverUsername });
        await AssertSuccess(response);
    }

    protected async Task EstablishFriendship(string senderToken, string senderUsername, string receiverToken, string receiverUsername)
    {
        await SendFriendRequest(senderToken, receiverUsername);

        HttpResponseMessage response = await Send(HttpMethod.Post, $"/friends/requests/{senderUsername}/accept", receiverToken);
        await AssertSuccess(response);
    }

    //SERVERS
    protected async Task<(string token, long serverId)> CreateServerAndGetId(string username)
    {
        string token = await RegisterAndGetToken(username);
        long serverId = await CreateServer(token, $"{username}server");

        return (token, serverId);
    }

    protected async Task<long> CreateServer(string token, string serverName)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, "/servers", token, new CreateServerRequest { serverName = serverName });
        await AssertSuccess(response);

        CreateServerResult? result = await response.Content.ReadFromJsonAsync<CreateServerResult>(CancellationToken);

        return result!.serverID;
    }

    protected async Task<Guid> CreateInviteCode(string token, long serverId, CreateInviteRequest? inviteRequest = null)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, $"/servers/{serverId}/invites", token, inviteRequest ?? new CreateInviteRequest());
        await AssertSuccess(response);

        CreateInviteResult? result = await response.Content.ReadFromJsonAsync<CreateInviteResult>(CancellationToken);

        return result!.inviteCode;
    }

    protected async Task JoinServer(string ownerToken, long serverId, string memberToken)
    {
        Guid inviteCode = await CreateInviteCode(ownerToken, serverId);

        HttpResponseMessage response = await Send(HttpMethod.Post, $"/invites/{inviteCode}/join", memberToken);
        await AssertSuccess(response);
    }

    protected async Task<(string ownerToken, string memberToken, long serverId)> CreateServerWithMember(string ownerUsername, string memberUsername)
    {
        (string ownerToken, long serverId) = await CreateServerAndGetId(ownerUsername);
        string memberToken = await RegisterAndGetToken(memberUsername);
        await JoinServer(ownerToken, serverId, memberToken);

        return (ownerToken, memberToken, serverId);
    }

    protected async Task<List<UserResult>> GetServerMembers(string token, long serverId)
    {
        return await GetJson<List<UserResult>>($"/servers/{serverId}/members", token);
    }

    //CHANNELS
    protected async Task<long> CreateChannel(string ownerToken, long serverId, string channelName)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, $"/servers/{serverId}/channels", ownerToken, new CreateChannelRequest { channelName = channelName });
        await AssertSuccess(response);

        CreateChannelResult? result = await response.Content.ReadFromJsonAsync<CreateChannelResult>(CancellationToken);

        return result!.channelID;
    }

    protected async Task<List<ChannelResult>> GetChannels(string token, long serverId)
    {
        return await GetJson<List<ChannelResult>>($"/servers/{serverId}/channels", token);
    }

    protected async Task<long> SendMessage(string token, long channelId, string messageText)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, $"/channels/{channelId}/messages", token, new SendMessageRequest { messageText = messageText });
        await AssertSuccess(response);

        SendMessageResult? result = await response.Content.ReadFromJsonAsync<SendMessageResult>(CancellationToken);

        return result!.id;
    }

    protected async Task<List<MessageResult>> GetMessages(string token, long channelId)
    {
        return await GetJson<List<MessageResult>>($"/channels/{channelId}/messages", token);
    }

    protected async Task<HttpResponseMessage> MarkChannelRead(string token, long channelId, long messageId)
    {
        return await Send(HttpMethod.Put, $"/channels/{channelId}/read-state", token, new UpdateReadStateRequest { lastReadMessageID = messageId });
    }

    protected async Task<bool> ChannelHasUnread(string token, long serverId, long channelId)
    {
        List<ChannelResult> channels = await GetChannels(token, serverId);

        return channels.Single(channel => channel.channelID == channelId).hasUnread;
    }

    //CONVERSATIONS
    protected async Task<long> CreateConversation(string token, List<string> memberUsernames, string? conversationName = null)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, "/conversations", token, new CreateConversationRequest { memberUsernames = memberUsernames, conversationName = conversationName ?? string.Empty });
        await AssertSuccess(response);

        CreateConversationResult? result = await response.Content.ReadFromJsonAsync<CreateConversationResult>(CancellationToken);

        return result!.conversationID;
    }

    protected async Task<(string tokenA, string tokenB, long conversationId)> CreateDmConversation(string usernameA, string usernameB)
    {
        (string tokenA, string tokenB) = await RegisterTwoUsers(usernameA, usernameB);
        long conversationId = await CreateConversation(tokenA, new List<string> { usernameB });

        return (tokenA, tokenB, conversationId);
    }

    // memberUsernames needs 2 or more entries to make a group, since 1 makes a DM
    protected async Task<(string ownerToken, long conversationId)> CreateGroupConversation(string ownerUsername, List<string> memberUsernames)
    {
        string ownerToken = await RegisterAndGetToken(ownerUsername);

        foreach (string memberUsername in memberUsernames)
        {
            await RegisterAndGetToken(memberUsername);
        }

        long conversationId = await CreateConversation(ownerToken, memberUsernames);

        return (ownerToken, conversationId);
    }

    protected async Task<long> SendConversationMessage(string token, long conversationId, string messageText)
    {
        HttpResponseMessage response = await Send(HttpMethod.Post, $"/conversations/{conversationId}/messages", token, new SendMessageRequest { messageText = messageText });
        await AssertSuccess(response);

        SendMessageResult? result = await response.Content.ReadFromJsonAsync<SendMessageResult>(CancellationToken);

        return result!.id;
    }

    protected async Task<List<MessageResult>> GetConversationMessages(string token, long conversationId)
    {
        return await GetJson<List<MessageResult>>($"/conversations/{conversationId}/messages", token);
    }

    protected async Task<HttpResponseMessage> MarkConversationRead(string token, long conversationId, long messageId)
    {
        return await Send(HttpMethod.Put, $"/conversations/{conversationId}/read-state", token, new UpdateReadStateRequest { lastReadMessageID = messageId });
    }

    protected async Task<List<ConversationResult>> GetConversations(string token)
    {
        return await GetJson<List<ConversationResult>>("/conversations", token);
    }

    protected async Task<List<UserResult>> GetConversationMembers(string token, long conversationId)
    {
        return await GetJson<List<UserResult>>($"/conversations/{conversationId}/members", token);
    }
}
