using System.Net;
using Backend.Tests.Helpers;

namespace Backend.Tests.Integration;

public class HealthTests : IntegrationTestBase
{
    public HealthTests(TestWebApplicationFactory factory) : base(factory)
    {
    }

    [Fact]
    public async Task Health_WithoutToken_ReturnsHealthy()
    {
        //act
        HttpResponseMessage response = await client.GetAsync("/health", CancellationToken);
        string body = await response.Content.ReadAsStringAsync(CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", body);
    }
}
