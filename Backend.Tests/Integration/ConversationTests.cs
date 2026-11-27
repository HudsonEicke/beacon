using System.Net;
using System.Net.Http.Json;
using Backend.Tests.Helpers;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests.Integration;

public class ConversationTests : IntegrationTestBase
{
    public ConversationTests(TestWebApplicationFactory factory) : base(factory)
    {
    }

    //CREATE CONVERSATION
    [Fact]
    public async Task CreateConversation_DirectWithValidUser_ReturnsOkWithResult()
    {
        //arrange
        string tokenA = await RegisterAndGetToken("cvdirectA", "cvdirectA@email.com");
        await RegisterAndGetToken("cvdirectB", "cvdirectB@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenA, new CreateConversationRequest { memberUsernames = new List<string> { "cvdirectB" } }),TestContext.Current.CancellationToken);
        CreateConversationResult? result = await response.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal(ConversationType.direct, result.conversationType);
        Assert.Contains("cvdirectA", result.memberUsernames);
        Assert.Contains("cvdirectB", result.memberUsernames);
    }

    [Fact]
    public async Task CreateConversation_DirectWithSelf_ReturnsForbidden()
    {
        //arrange
        string token = await RegisterAndGetToken("cvdirself", "cvdirself@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", token, new CreateConversationRequest { memberUsernames = new List<string> { "cvdirself" } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task CreateConversation_DirectWithNonExistentUser_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("cvdirnotf", "cvdirnotf@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", token, new CreateConversationRequest { memberUsernames = new List<string> { "nonexistentuser99999" } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateConversation_DirectWhenAlreadyExists_ReturnsExistingDm()
    {
        //arrange
        (string tokenA, _, long conversationId) = await CreateDmConversation("cvdirdupeA", "cvdirdupeB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenA, new CreateConversationRequest { memberUsernames = new List<string> { "cvdirdupeB" } }),TestContext.Current.CancellationToken);
        CreateConversationResult? result = await response.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal(conversationId, result.conversationID);
    }

    [Fact]
    public async Task CreateConversation_DirectFromBothUsersAtOnce_CreatesOneDm()
    {
        //arrange
        string tokenA = await RegisterAndGetToken("racedmboth1", "racedmboth1@email.com");
        string tokenB = await RegisterAndGetToken("racedmboth2", "racedmboth2@email.com");

        //act
        HttpResponseMessage[] responses = await Task.WhenAll(client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenA, new CreateConversationRequest { memberUsernames = new List<string> { "racedmboth2" } }), TestContext.Current.CancellationToken), client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenB, new CreateConversationRequest { memberUsernames = new List<string> { "racedmboth1" } }), TestContext.Current.CancellationToken));
        CreateConversationResult? firstResult = await responses[0].Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);
        CreateConversationResult? secondResult = await responses[1].Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);
        HttpResponseMessage listResponse = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", tokenA), TestContext.Current.CancellationToken);
        List<ConversationResult>? conversations = await listResponse.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(firstResult!.conversationID, secondResult!.conversationID);
        Assert.Single(conversations!, conversation => conversation.conversationType == ConversationType.direct);
    }

    [Fact]
    public async Task CreateConversation_DirectAfterLeaving_RejoinsSameDm()
    {
        //arrange
        (string tokenA, _, long conversationId) = await CreateDmConversation("racedmrejoinA", "racedmrejoinB");
        await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", tokenA), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenA, new CreateConversationRequest { memberUsernames = new List<string> { "racedmrejoinB" } }), TestContext.Current.CancellationToken);
        CreateConversationResult? result = await response.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(conversationId, result!.conversationID);
    }

    [Fact]
    public async Task CreateConversation_Direct_ReturnsOtherUsername()
    {
        //arrange
        string tokenA = await RegisterAndGetToken("cvotherA", "cvotherA@email.com");
        await RegisterAndGetToken("cvotherB", "cvotherB@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenA, new CreateConversationRequest { memberUsernames = new List<string> { "cvotherB" } }), TestContext.Current.CancellationToken);
        CreateConversationResult? result = await response.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("cvotherB", result!.otherUsername);
    }

    [Fact]
    public async Task CreateConversation_GroupWithValidUsers_ReturnsOkWithResult()
    {
        //arrange
        string ownerToken = await RegisterAndGetToken("cvgroupowner", "cvgroupowner@email.com");
        await RegisterAndGetToken("cvgroupmem1", "cvgroupmem1@email.com");
        await RegisterAndGetToken("cvgroupmem2", "cvgroupmem2@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", ownerToken, new CreateConversationRequest{conversationName = "Test Group", memberUsernames = new List<string> { "cvgroupmem1", "cvgroupmem2" }}),TestContext.Current.CancellationToken);
        CreateConversationResult? result = await response.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal(ConversationType.group, result.conversationType);
        Assert.Equal("Test Group", result.conversationName);
        Assert.Equal("cvgroupowner", result.ownerUsername);
    }

    [Fact]
    public async Task CreateConversation_GroupWithSelfIncluded_ReturnsForbidden()
    {
        //arrange
        string ownerToken = await RegisterAndGetToken("cvgrpself", "cvgrpself@email.com");
        await RegisterAndGetToken("cvgrpselfmem", "cvgrpselfmem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", ownerToken, new CreateConversationRequest { memberUsernames = new List<string> { "cvgrpselfmem", "cvgrpself" } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task CreateConversation_GroupWithNonExistentUser_ReturnsNotFound()
    {
        //arrange
        string ownerToken = await RegisterAndGetToken("cvgrpnotf", "cvgrpnotf@email.com");
        await RegisterAndGetToken("cvgrpnotfmem", "cvgrpnotfmem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", ownerToken, new CreateConversationRequest { memberUsernames = new List<string> { "cvgrpnotfmem", "nonexistentuser99999" } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateConversation_WithEmptyMemberList_ReturnsBadRequest()
    {
        //arrange
        string token = await RegisterAndGetToken("cvemptylist", "cvemptylist@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", token, new CreateConversationRequest { memberUsernames = new List<string>() }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateConversation_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/conversations",new CreateConversationRequest { memberUsernames = new List<string> { "someuser" } },TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //GET CONVERSATIONS
    [Fact]
    public async Task GetConversations_WithConversations_ReturnsOkWithList()
    {
        //arrange
        (string token, _, _) = await CreateDmConversation("cvgetconvsA", "cvgetconvsB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", token), TestContext.Current.CancellationToken);
        List<ConversationResult>? result = await response.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.NotEmpty(result);
    }

    [Fact]
    public async Task GetConversations_AfterOtherUserLeavesDm_StillListsDm()
    {
        //arrange
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("cvdmstaysA", "cvdmstaysB");
        await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", tokenB), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", tokenA), TestContext.Current.CancellationToken);
        List<ConversationResult>? result = await response.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        ConversationResult dm = Assert.Single(result!, conversation => conversation.id == conversationId);
        Assert.Equal("cvdmstaysB", dm.conversationName);
    }

    [Fact]
    public async Task GetConversations_WithDm_ReturnsOtherUsername()
    {
        //arrange
        (string tokenA, _, long conversationId) = await CreateDmConversation("cvlistotherA", "cvlistotherB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", tokenA), TestContext.Current.CancellationToken);
        List<ConversationResult>? result = await response.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        ConversationResult dm = Assert.Single(result!, conversation => conversation.id == conversationId);
        Assert.Equal("cvlistotherB", dm.otherUsername);
    }

    [Fact]
    public async Task GetConversations_WithGroup_ReturnsNullOtherUsername()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvlistgrpown", new List<string> { "cvlistgrpmem1", "cvlistgrpmem2" });

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", ownerToken), TestContext.Current.CancellationToken);
        List<ConversationResult>? result = await response.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        ConversationResult group = Assert.Single(result!, conversation => conversation.id == conversationId);
        Assert.Null(group.otherUsername);
    }

    [Fact]
    public async Task GetConversations_WhenNone_ReturnsEmptyList()
    {
        //arrange
        string token = await RegisterAndGetToken("cvgetconvsmt", "cvgetconvsmt@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", token), TestContext.Current.CancellationToken);
        List<ConversationResult>? result = await response.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetConversations_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.GetAsync("/conversations", TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //GET CONVERSATION
    [Fact]
    public async Task GetConversation_WhenMember_ReturnsOkWithResult()
    {
        //arrange
        (string token, _, long conversationId) = await CreateDmConversation("cvgetconvA", "cvgetconvB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/conversations/{conversationId}", token), TestContext.Current.CancellationToken);
        ConversationResult? result = await response.Content.ReadFromJsonAsync<ConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal(conversationId, result.id);
        Assert.Equal(ConversationType.direct, result.conversationType);
    }

    [Fact]
    public async Task GetConversation_AfterOtherUserLeavesDm_ReturnsOtherUsersName()
    {
        //arrange
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("cvdmnameA", "cvdmnameB");
        await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", tokenB), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/conversations/{conversationId}", tokenA), TestContext.Current.CancellationToken);
        ConversationResult? result = await response.Content.ReadFromJsonAsync<ConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("cvdmnameB", result!.conversationName);
    }

    [Fact]
    public async Task GetConversation_WhenNotMember_ReturnsForbidden()
    {
        //arrange
        (_, _, long conversationId) = await CreateDmConversation("cvgetconvownr", "cvgetconvownrB");
        string nonMemberToken = await RegisterAndGetToken("cvgetconvnonem", "cvgetconvnonem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/conversations/{conversationId}", nonMemberToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetConversation_WithNonExistentId_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("cvgetconvnotf", "cvgetconvnotf@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations/999999999", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetConversation_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.GetAsync("/conversations/1", TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //GET CONVERSATION MEMBERS
    [Fact]
    public async Task GetConversationMembers_WhenMember_ReturnsOkWithList()
    {
        //arrange
        (string token, _, long conversationId) = await CreateDmConversation("cvgetmemA", "cvgetmemB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/conversations/{conversationId}/members", token), TestContext.Current.CancellationToken);
        List<UserResult>? result = await response.Content.ReadFromJsonAsync<List<UserResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal(2, result.Count);
    }

    [Fact]
    public async Task GetConversationMembers_WhenNotMember_ReturnsForbidden()
    {
        //arrange
        (_, _, long conversationId) = await CreateDmConversation("cvgetmemownr", "cvgetmemownrB");
        string nonMemberToken = await RegisterAndGetToken("cvgetmemnonem", "cvgetmemnonem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/conversations/{conversationId}/members", nonMemberToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetConversationMembers_WithNonExistentId_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("cvgetmemnotf", "cvgetmemnotf@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations/999999999/members", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetConversationMembers_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.GetAsync("/conversations/1/members", TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //ADD MEMBER
    [Fact]
    public async Task AddMember_AsOwnerToGroupConversation_ReturnsOkWithUserResult()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvaddowner", new List<string> { "cvaddmem", "cvaddmem2" });
        string newMemberToken = await RegisterAndGetToken("cvaddnewmem", "cvaddnewmem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/members", ownerToken, new AddConversationMemberRequest { username = "cvaddnewmem" }),TestContext.Current.CancellationToken);
        UserResult? result = await response.Content.ReadFromJsonAsync<UserResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal("cvaddnewmem", result.username);
        Assert.Contains(await GetConversationMembers(ownerToken, conversationId), member => member.username == "cvaddnewmem");
        Assert.Contains(await GetConversations(newMemberToken), conversation => conversation.id == conversationId);
    }

    [Fact]
    public async Task AddMember_ToGroupWithMessages_StartsWithNoUnread()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("rsaddown", new List<string> { "rsaddmem1", "rsaddmem2" });
        string newMemberToken = await RegisterAndGetToken("rsaddnewmem", "rsaddnewmem@email.com");
        await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/messages", ownerToken, new SendMessageRequest { messageText = "before you joined" }), TestContext.Current.CancellationToken);

        //act
        await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/members", ownerToken, new AddConversationMemberRequest { username = "rsaddnewmem" }), TestContext.Current.CancellationToken);
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/conversations", newMemberToken), TestContext.Current.CancellationToken);
        List<ConversationResult>? result = await response.Content.ReadFromJsonAsync<List<ConversationResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(0, result!.Single(conversation => conversation.id == conversationId).unreadCount);
    }

    [Fact]
    public async Task AddMember_AsNonOwner_ReturnsForbidden()
    {
        //arrange — register manually to obtain member token; group needs 2+ members
        string ownerToken = await RegisterAndGetToken("cvaddnonownr", "cvaddnonownr@email.com");
        string memberToken = await RegisterAndGetToken("cvaddnonownrmem", "cvaddnonownrmem@email.com");
        await RegisterAndGetToken("cvaddnonownrm2", "cvaddnonownrm2@email.com");
        HttpResponseMessage createResponse = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", ownerToken, new CreateConversationRequest { memberUsernames = ["cvaddnonownrmem", "cvaddnonownrm2"] }),TestContext.Current.CancellationToken);
        CreateConversationResult? conv = await createResponse.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);
        await RegisterAndGetToken("cvaddnonownradd", "cvaddnonownradd@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conv!.conversationID}/members", memberToken, new AddConversationMemberRequest { username = "cvaddnonownradd" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.DoesNotContain(await GetConversationMembers(ownerToken, conv.conversationID), member => member.username == "cvaddnonownradd");
    }

    [Fact]
    public async Task AddMember_ToDirectConversation_ReturnsBadRequest()
    {
        //arrange
        (string tokenA, _, long conversationId) = await CreateDmConversation("cvadddmA", "cvadddmB");
        await RegisterAndGetToken("cvadddmnew", "cvadddmnew@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/members", tokenA, new AddConversationMemberRequest { username = "cvadddmnew" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AddMember_WhenAlreadyMember_ReturnsConflict()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvaddalready", ["cvaddalreadymem", "cvaddalreadym2"]);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/members", ownerToken, new AddConversationMemberRequest { username = "cvaddalreadymem" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task AddMember_WithNonExistentUser_ReturnsNotFound()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvaddnotfuser", ["cvaddnotfusrmem", "cvaddnotfusrm2"]);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/members", ownerToken, new AddConversationMemberRequest { username = "nonexistentuser99999" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AddMember_WithNonExistentConversation_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("cvaddnoconv", "cvaddnoconv@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations/999999999/members", token, new AddConversationMemberRequest { username = "someuser" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AddMember_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/conversations/1/members", new AddConversationMemberRequest { username = "someuser" }, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //LEAVE CONVERSATION
    [Fact]
    public async Task LeaveConversation_AsDmMember_ReturnsNoContent()
    {
        //arrange
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("cvleavedmA", "cvleavedmB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", tokenA), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain(await GetConversations(tokenA), conversation => conversation.id == conversationId);
        Assert.Contains(await GetConversations(tokenB), conversation => conversation.id == conversationId);
    }

    [Fact]
    public async Task LeaveConversation_AsGroupNonOwner_ReturnsNoContent()
    {
        //arrange — register manually to obtain member token; group needs 2+ members
        string ownerToken = await RegisterAndGetToken("cvleavegrpown", "cvleavegrpown@email.com");
        string memberToken = await RegisterAndGetToken("cvleavegrpmem", "cvleavegrpmem@email.com");
        await RegisterAndGetToken("cvleavegrpmem2", "cvleavegrpmem2@email.com");
        HttpResponseMessage createResponse = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", ownerToken, new CreateConversationRequest { memberUsernames = ["cvleavegrpmem", "cvleavegrpmem2"] }),TestContext.Current.CancellationToken);
        CreateConversationResult? conv = await createResponse.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conv!.conversationID}/members/me", memberToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain(await GetConversationMembers(ownerToken, conv.conversationID), member => member.username == "cvleavegrpmem");
        Assert.Equal(HttpStatusCode.Forbidden, await GetStatus($"/conversations/{conv.conversationID}", memberToken));
    }

    [Fact]
    public async Task LeaveConversation_AsLastDmMember_DeletesConversationAndReturnsNoContent()
    {
        //arrange — B leaves first, then A leaves as the last remaining member
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("cvleavelastA", "cvleavelastB");
        await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", tokenB), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", tokenA), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        bool conversationExists = await WithDatabase(async db => await db.Conversations.AnyAsync(conversation => conversation.id == conversationId, TestContext.Current.CancellationToken));
        Assert.False(conversationExists);
    }

    [Fact]
    public async Task LeaveConversation_WhenNotMember_ReturnsForbidden()
    {
        //arrange
        (_, _, long conversationId) = await CreateDmConversation("cvleavenotmA", "cvleavenotmB");
        string nonMemberToken = await RegisterAndGetToken("cvleavenotmem", "cvleavenotmem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", nonMemberToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task LeaveConversation_WithNonExistentConversation_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("cvleavenotconv", "cvleavenotconv@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, "/conversations/999999999/members/me", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task LeaveConversation_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.DeleteAsync("/conversations/1/members/me", TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //UPDATE CONVERSATION
    [Fact]
    public async Task LeaveConversation_AsGroupOwner_TransfersOwnership()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvleaveownr", new List<string> { "cvleaveownrm1", "cvleaveownrm2" });
        string memberToken = await Login("cvleaveownrm1");
        await RegisterAndGetToken("cvleaveownradd");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/conversations/{conversationId}/members/me", ownerToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        ConversationResult conversation = await GetJson<ConversationResult>($"/conversations/{conversationId}", memberToken);
        Assert.Contains(conversation.ownerUsername, new List<string> { "cvleaveownrm1", "cvleaveownrm2" });
        string newOwnerToken = await Login(conversation.ownerUsername!);
        HttpResponseMessage addResponse = await Send(HttpMethod.Post, $"/conversations/{conversationId}/members", newOwnerToken, new AddConversationMemberRequest { username = "cvleaveownradd" });
        Assert.Equal(HttpStatusCode.OK, addResponse.StatusCode);
    }

    [Fact]
    public async Task UpdateConversation_AsMemberWithValidData_ReturnsNoContent()
    {
        //arrange
        string ownerToken = await RegisterAndGetToken("cvupdowner", "cvupdowner@email.com");
        string memberToken = await RegisterAndGetToken("cvupdmem", "cvupdmem@email.com");
        await RegisterAndGetToken("cvupdmem2", "cvupdmem2@email.com");
        HttpResponseMessage createResponse = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", ownerToken, new CreateConversationRequest { memberUsernames = ["cvupdmem", "cvupdmem2"] }), TestContext.Current.CancellationToken);
        CreateConversationResult? conv = await createResponse.Content.ReadFromJsonAsync<CreateConversationResult>(TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/conversations/{conv!.conversationID}", memberToken, new UpdateConversationRequest { conversationName = "Updated Name" }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        ConversationResult updated = await GetJson<ConversationResult>($"/conversations/{conv.conversationID}", ownerToken);
        Assert.Equal("Updated Name", updated.conversationName);
    }

    [Fact]
    public async Task UpdateConversation_OnDirectConversation_ReturnsBadRequest()
    {
        //arrange
        (string tokenA, _, long conversationId) = await CreateDmConversation("cvupddmA", "cvupddmB");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/conversations/{conversationId}", tokenA, new UpdateConversationRequest { conversationName = "New Name" }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateConversation_WhenNotMember_ReturnsForbidden()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvupdnotmown", ["cvupdnotmmem", "cvupdnotmmem2"]);
        string nonMemberToken = await RegisterAndGetToken("cvupdnonem", "cvupdnonem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/conversations/{conversationId}", nonMemberToken, new UpdateConversationRequest { conversationName = "Hacked Name" }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        ConversationResult unchanged = await GetJson<ConversationResult>($"/conversations/{conversationId}", ownerToken);
        Assert.NotEqual("Hacked Name", unchanged.conversationName);
    }

    [Fact]
    public async Task UpdateConversation_WithNonExistentConversation_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("cvupdnotf", "cvupdnotf@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, "/conversations/999999999", token, new UpdateConversationRequest { conversationName = "New Name" }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UpdateConversation_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.PatchAsJsonAsync("/conversations/1", new UpdateConversationRequest { conversationName = "New Name" }, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateConversation_GroupWithLongGeneratedName_TrimsToColumnLength()
    {
        //arrange: four 32 character display names joined together are longer than 100 characters
        List<string> memberUsernames = new List<string> { "lmgroupmemberone".PadRight(32, 'x'), "lmgroupmembertwo".PadRight(32, 'x'), "lmgroupmemberthree".PadRight(32, 'x') };

        //act
        (string ownerToken, long conversationId) = await CreateGroupConversation("lmgroupowner".PadRight(32, 'x'), memberUsernames);
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/conversations/{conversationId}", ownerToken), TestContext.Current.CancellationToken);
        ConversationResult? result = await response.Content.ReadFromJsonAsync<ConversationResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(100, result!.conversationName.Length);
        Assert.EndsWith("...", result.conversationName);
    }

    //BLOCKING
    [Fact]
    public async Task CreateConversation_DirectWhenBlocked_ReturnsForbidden()
    {
        //arrange
        string tokenA = await RegisterAndGetToken("cvblockdmA", "cvblockdmA@email.com");
        string tokenB = await RegisterAndGetToken("cvblockdmB", "cvblockdmB@email.com");
        await client.SendAsync(CreateRequest(HttpMethod.Put, "/friends/blocked/cvblockdmA", tokenB), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/conversations", tokenA, new CreateConversationRequest { memberUsernames = new List<string> { "cvblockdmB" } }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task SendMessage_InDirectAfterBlock_ReturnsForbidden()
    {
        //arrange
        (string tokenA, string tokenB, long conversationId) = await CreateDmConversation("cvblocksendA", "cvblocksendB");
        await client.SendAsync(CreateRequest(HttpMethod.Put, "/friends/blocked/cvblocksendA", tokenB), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/messages", tokenA, new SendMessageRequest { messageText = "hello?" }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AddMember_WhenBlocked_ReturnsForbidden()
    {
        //arrange
        (string ownerToken, long conversationId) = await CreateGroupConversation("cvblockaddown", new List<string> { "cvblockaddm1", "cvblockaddm2" });
        string newMemberToken = await RegisterAndGetToken("cvblockaddnew", "cvblockaddnew@email.com");
        await client.SendAsync(CreateRequest(HttpMethod.Put, "/friends/blocked/cvblockaddown", newMemberToken), TestContext.Current.CancellationToken);

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/conversations/{conversationId}/members", ownerToken, new AddConversationMemberRequest { username = "cvblockaddnew" }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
