using System.Net;
using System.Net.Http.Json;
using Backend.Tests.Helpers;

namespace Backend.Tests.Integration;

public class ChannelTests : IntegrationTestBase
{
    public ChannelTests(TestWebApplicationFactory factory) : base(factory)
    {
    }

    //CREATE CHANNEL
    [Fact]
    public async Task CreateChannel_AsOwner_ReturnsOkWithChannelResult()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chcreatechan");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/servers/{serverId}/channels", token, new CreateChannelRequest { channelName = "general" }), TestContext.Current.CancellationToken);
        CreateChannelResult? result = await response.Content.ReadFromJsonAsync<CreateChannelResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Equal("general", result.channelName);
        Assert.Equal(0, result.channelOrder);
        List<ChannelResult> channels = await GetChannels(token, serverId);
        Assert.Contains(channels, channel => channel.channelID == result.channelID && channel.channelName == "general");
    }

    [Fact]
    public async Task CreateChannel_AsNonOwner_ReturnsForbidden()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("chchannonownr", "chchannonmem");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/servers/{serverId}/channels", memberToken, new CreateChannelRequest { channelName = "general" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Empty(await GetChannels(ownerToken, serverId));
    }

    [Fact]
    public async Task CreateChannel_WithEmptyName_ReturnsBadRequest()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chchanempty");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/servers/{serverId}/channels", token, new CreateChannelRequest { channelName = "" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateChannel_WithNonExistentServer_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("chchannelnoserv", "chchannelnoserv@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Post, "/servers/999999999/channels", token, new CreateChannelRequest { channelName = "general" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateChannel_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/servers/1/channels",new CreateChannelRequest { channelName = "general" }, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //GET CHANNELS
    [Fact]
    public async Task GetChannels_AsMember_ReturnsOkWithList()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chgetchannels");
        await CreateChannel(token, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/servers/{serverId}/channels", token), TestContext.Current.CancellationToken);
        List<ChannelResult>? result = await response.Content.ReadFromJsonAsync<List<ChannelResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.Single(result);
        Assert.Equal("general", result[0].channelName);
    }

    [Fact]
    public async Task GetChannels_AsNonMember_ReturnsForbidden()
    {
        //arrange
        (_, long serverId) = await CreateServerAndGetId("chgetchanowner");
        string nonMemberToken = await RegisterAndGetToken("chgetchannonem", "chgetchannonem@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/servers/{serverId}/channels", nonMemberToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetChannels_WithNonExistentServer_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("chgetchannoserv", "chgetchannoserv@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Get, "/servers/999999999/channels", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetChannels_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.GetAsync("/servers/1/channels", TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //REORDER CHANNELS
    [Fact]
    public async Task ReorderChannels_AsOwnerWithValidOrder_ReturnsNoContent()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chreorderowner");
        long channelId1 = await CreateChannel(token, serverId, "general");
        long channelId2 = await CreateChannel(token, serverId, "random");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Put, $"/servers/{serverId}/channels/order", token, new ReorderChannelRequest { channelIDs = new List<long> { channelId2, channelId1 } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        List<ChannelResult> channels = await GetChannels(token, serverId);
        Assert.Equal(new List<long> { channelId2, channelId1 }, channels.OrderBy(channel => channel.channelOrder).Select(channel => channel.channelID).ToList());
    }

    [Fact]
    public async Task ReorderChannels_AsNonOwner_ReturnsForbidden()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("chreordnonownr", "chreordnonmem");
        long channelId = await CreateChannel(ownerToken, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Put, $"/servers/{serverId}/channels/order", memberToken,    new ReorderChannelRequest { channelIDs = new List<long> { channelId } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ReorderChannels_WithMismatchedCount_ReturnsBadRequest()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chreorderbad");
        long channelId = await CreateChannel(token, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Put, $"/servers/{serverId}/channels/order", token, new ReorderChannelRequest { channelIDs = new List<long> { channelId, 99999L } }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ReorderChannels_WithDuplicateIds_ReturnsBadRequest()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("racereorddup");
        long channelId = await CreateChannel(token, serverId, "first");
        await CreateChannel(token, serverId, "second");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Put, $"/servers/{serverId}/channels/order", token, new ReorderChannelRequest { channelIDs = new List<long> { channelId, channelId } }), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateChannel_ManyAtOnce_GetDistinctOrders()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("racechanorder");

        //act
        HttpResponseMessage[] responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(i => client.SendAsync(CreateRequest(HttpMethod.Post, $"/servers/{serverId}/channels", token, new CreateChannelRequest { channelName = $"channel{i}" }), TestContext.Current.CancellationToken)));
        HttpResponseMessage listResponse = await client.SendAsync(CreateRequest(HttpMethod.Get, $"/servers/{serverId}/channels", token), TestContext.Current.CancellationToken);
        List<ChannelResult>? channels = await listResponse.Content.ReadFromJsonAsync<List<ChannelResult>>(TestContext.Current.CancellationToken);

        //assert
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(new List<int> { 0, 1, 2, 3, 4 }, channels!.Select(channel => channel.channelOrder).OrderBy(order => order).ToList());
    }

    [Fact]
    public async Task ReorderChannels_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.PutAsJsonAsync("/servers/1/channels/order",new ReorderChannelRequest { channelIDs = new List<long> { 1L } }, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //UPDATE CHANNEL
    [Fact]
    public async Task UpdateChannel_AsOwner_ReturnsNoContent()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chupdatechan");
        long channelId = await CreateChannel(token, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/channels/{channelId}", token, new UpdateChannelRequest { channelName = "updated" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        List<ChannelResult> channels = await GetChannels(token, serverId);
        Assert.Equal("updated", channels.Single(channel => channel.channelID == channelId).channelName);
    }

    [Fact]
    public async Task UpdateChannel_AsNonOwner_ReturnsForbidden()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("chupdchannonownr", "chupdchannonmem");
        long channelId = await CreateChannel(ownerToken, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/channels/{channelId}", memberToken, new UpdateChannelRequest { channelName = "hacked" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        List<ChannelResult> channels = await GetChannels(ownerToken, serverId);
        Assert.Equal("general", channels.Single(channel => channel.channelID == channelId).channelName);
    }

    [Fact]
    public async Task UpdateChannel_WithEmptyName_ReturnsBadRequest()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chupdchanempty");
        long channelId = await CreateChannel(token, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/channels/{channelId}", token, new UpdateChannelRequest { channelName = "" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateChannel_WithNonExistentChannel_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("chupdchannotf", "chupdchannotf@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Patch, "/channels/999999999", token, new UpdateChannelRequest { channelName = "updated" }),TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UpdateChannel_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.PatchAsJsonAsync("/channels/1",new UpdateChannelRequest { channelName = "updated" }, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //DELETE CHANNEL
    [Fact]
    public async Task DeleteChannel_RenumbersRemainingChannels()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chdelrenumber");
        long firstChannelId = await CreateChannel(token, serverId, "first");
        long secondChannelId = await CreateChannel(token, serverId, "second");
        long thirdChannelId = await CreateChannel(token, serverId, "third");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/channels/{firstChannelId}", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        List<ChannelResult> channels = await GetChannels(token, serverId);
        Assert.Equal(new List<(long, int)> { (secondChannelId, 0), (thirdChannelId, 1) }, channels.OrderBy(channel => channel.channelOrder).Select(channel => (channel.channelID, channel.channelOrder)).ToList());
    }

    [Fact]
    public async Task DeleteChannel_AsOwner_ReturnsNoContent()
    {
        //arrange
        (string token, long serverId) = await CreateServerAndGetId("chdelchan");
        long channelId = await CreateChannel(token, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/channels/{channelId}", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain(await GetChannels(token, serverId), channel => channel.channelID == channelId);
        Assert.Equal(HttpStatusCode.NotFound, await GetStatus($"/channels/{channelId}/messages", token));
    }

    [Fact]
    public async Task DeleteChannel_AsNonOwner_ReturnsForbidden()
    {
        //arrange
        (string ownerToken, string memberToken, long serverId) = await CreateServerWithMember("chdelchannonownr", "chdelchannonmem");
        long channelId = await CreateChannel(ownerToken, serverId, "general");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, $"/channels/{channelId}", memberToken), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains(await GetChannels(ownerToken, serverId), channel => channel.channelID == channelId);
    }

    [Fact]
    public async Task DeleteChannel_WithNonExistentChannel_ReturnsNotFound()
    {
        //arrange
        string token = await RegisterAndGetToken("chdelchannotf", "chdelchannotf@email.com");

        //act
        HttpResponseMessage response = await client.SendAsync(CreateRequest(HttpMethod.Delete, "/channels/999999999", token), TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DeleteChannel_WithoutToken_ReturnsUnauthorized()
    {
        //act
        HttpResponseMessage response = await client.DeleteAsync("/channels/1", TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
