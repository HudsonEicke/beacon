using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Backend.Tests.Helpers;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests.Integration;

public class AuthTests : IntegrationTestBase
{
    public AuthTests(TestWebApplicationFactory factory) : base(factory)
    {
    }

    //REGISTER
    [Fact]
    public async Task Register_WithValidRequest_ReturnsOkWithTokens()
    {
        //arrange
        RegisterRequest request = new RegisterRequest
        {
            username = "registertest",
            email = "registertest@email.com",
            password = "Test123!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);
        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.True(result.success);
        Assert.NotEmpty(result.accessToken);
        Assert.NotEmpty(result.refreshToken);
    }

    [Fact]
    public async Task Register_WithDuplicateUsername_ReturnsConflict()
    {
        //arrange
        RegisterRequest request = new RegisterRequest
        {
            username = "duplicateuser",
            email = "duplicate@email.com",
            password = "Test123!"
        };
        await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);

        RegisterRequest duplicate = new RegisterRequest
        {
            username = "duplicateuser",
            email = "different@email.com",
            password = "Test123!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", duplicate, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Register_SameUsernameAtOnce_OneSucceedsAndOneConflicts()
    {
        //arrange
        RegisterRequest first = new RegisterRequest { username = "racereguser", email = "racereg1@email.com", password = "Test123!" };
        RegisterRequest second = new RegisterRequest { username = "racereguser", email = "racereg2@email.com", password = "Test123!" };

        //act
        HttpResponseMessage[] responses = await Task.WhenAll(client.PostAsJsonAsync("/auth/register", first, TestContext.Current.CancellationToken), client.PostAsJsonAsync("/auth/register", second, TestContext.Current.CancellationToken));

        //assert: the loser gets a 409, never a 500
        Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }, responses.Select(response => response.StatusCode).OrderBy(status => status).ToArray());
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsConflict()
    {
        //arrange
        RegisterRequest request = new RegisterRequest
        {
            username = "uniqueuser",
            email = "sharedemail@email.com",
            password = "Test123!"
        };
        await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);

        RegisterRequest duplicate = new RegisterRequest
        {
            username = "differentuser",
            email = "sharedemail@email.com",
            password = "Test123!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", duplicate, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithEmptyFields_ReturnsBadRequest()
    {
        //arrange
        RegisterRequest request = new RegisterRequest
        {
            username = "",
            email = "",
            password = ""
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithReservedUsername_ReturnsBadRequest()
    {
        //arrange
        RegisterRequest request = new RegisterRequest
        {
            username = "Me",
            email = "reservedme@email.com",
            password = "Test123!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    //LOGIN
    [Fact]
    public async Task Login_WithValidCredentials_ReturnsOkWithTokens()
    {
        //arrange
        RegisterRequest registerRequest = new RegisterRequest
        {
            username = "logintest",
            email = "logintest@email.com",
            password = "Test123!"
        };
        await client.PostAsJsonAsync("/auth/register", registerRequest, TestContext.Current.CancellationToken);

        LoginRequest loginRequest = new LoginRequest
        {
            username = "logintest",
            password = "Test123!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/login", loginRequest, TestContext.Current.CancellationToken);
        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.True(result.success);
        Assert.NotEmpty(result.accessToken);
        Assert.NotEmpty(result.refreshToken);
    }

    [Fact]
    public async Task Login_WithInvalidPassword_ReturnsUnauthorized()
    {
        //arrange
        RegisterRequest registerRequest = new RegisterRequest
        {
            username = "loginwrongpass",
            email = "loginwrongpass@email.com",
            password = "Test123!"
        };
        await client.PostAsJsonAsync("/auth/register", registerRequest, TestContext.Current.CancellationToken);

        LoginRequest loginRequest = new LoginRequest
        {
            username = "loginwrongpass",
            password = "WrongPassword!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/login", loginRequest, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithNonExistentUser_ReturnsUnauthorized()
    {
        //arrange
        LoginRequest loginRequest = new LoginRequest
        {
            username = "nonexistentuser",
            password = "Test123!"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/login", loginRequest, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //REFRESH
    [Fact]
    public async Task Refresh_WithValidToken_ReturnsNewTokens()
    {
        //arrange
        RegisterRequest registerRequest = new RegisterRequest
        {
            username = "refreshtest",
            email = "refreshtest@email.com",
            password = "Test123!"
        };
        HttpResponseMessage registerResponse = await client.PostAsJsonAsync("/auth/register", registerRequest, TestContext.Current.CancellationToken);
        AuthResult? registerResult = await registerResponse.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        RefreshRequest refreshRequest = new RefreshRequest
        {
            accessToken = registerResult!.accessToken,
            refreshToken = registerResult.refreshToken
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/refresh", refreshRequest, TestContext.Current.CancellationToken);
        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.NotEmpty(result.accessToken);
        Assert.NotEmpty(result.refreshToken);
        Assert.NotEqual(registerResult.refreshToken, result.refreshToken);
    }

    [Fact]
    public async Task Refresh_WithInvalidToken_ReturnsUnauthorized()
    {
        //arrange
        RefreshRequest refreshRequest = new RefreshRequest
        {
            accessToken = "invalid",
            refreshToken = "invalid"
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/refresh", refreshRequest, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    //LOGOUT
    [Fact]
    public async Task Refresh_WithReusedToken_RevokesEverySession()
    {
        //arrange: two sessions, and the first one's refresh token is used once
        AuthResult firstSession = await Register("reusetoken");
        string secondSessionRefreshToken = (await LoginAndGetResult("reusetoken")).refreshToken;
        AuthResult rotated = await RefreshAndGetResult(firstSession);

        //act: the replaced token is used again, as a thief holding a copy would
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/refresh", new RefreshRequest { accessToken = firstSession.accessToken, refreshToken = firstSession.refreshToken }, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        HttpResponseMessage rotatedResponse = await client.PostAsJsonAsync("/auth/refresh", new RefreshRequest { accessToken = rotated.accessToken, refreshToken = rotated.refreshToken }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, rotatedResponse.StatusCode);
        HttpResponseMessage secondSessionResponse = await client.PostAsJsonAsync("/auth/refresh", new RefreshRequest { refreshToken = secondSessionRefreshToken }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, secondSessionResponse.StatusCode);
    }

    [Fact]
    public async Task Refresh_WithExpiredToken_ReturnsUnauthorized()
    {
        //arrange
        AuthResult session = await Register("expiredtoken");
        string hashedToken = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(session.refreshToken)));
        await WithDatabase(async db => await db.RefreshTokens.Where(token => token.token == hashedToken).ExecuteUpdateAsync(setters => setters.SetProperty(token => token.expiresDate, DateTimeOffset.UtcNow.AddMinutes(-1)), TestContext.Current.CancellationToken));

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/refresh", new RefreshRequest { accessToken = session.accessToken, refreshToken = session.refreshToken }, TestContext.Current.CancellationToken);
        AuthResult? result = await response.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Token has expired", result?.message);
    }

    private async Task<AuthResult> LoginAndGetResult(string username)
    {
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/login", new LoginRequest { username = username, password = TestPassword }, TestContext.Current.CancellationToken);
        await AssertSuccess(response);

        return (await response.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken))!;
    }

    private async Task<AuthResult> RefreshAndGetResult(AuthResult session)
    {
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/refresh", new RefreshRequest { accessToken = session.accessToken, refreshToken = session.refreshToken }, TestContext.Current.CancellationToken);
        await AssertSuccess(response);

        return (await response.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public async Task Logout_WithValidToken_ReturnsOk()
    {
        //arrange
        RegisterRequest registerRequest = new RegisterRequest
        {
            username = "logouttest",
            email = "logouttest@email.com",
            password = "Test123!"
        };
        HttpResponseMessage registerResponse = await client.PostAsJsonAsync("/auth/register", registerRequest, TestContext.Current.CancellationToken);
        AuthResult? registerResult = await registerResponse.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        LogoutRequest logoutRequest = new LogoutRequest
        {
            refreshToken = registerResult!.refreshToken
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/logout", logoutRequest, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Logout_ThenRefresh_ReturnsUnauthorized()
    {
        //arrange
        RegisterRequest registerRequest = new RegisterRequest
        {
            username = "logoutrefreshtest",
            email = "logoutrefreshtest@email.com",
            password = "Test123!"
        };
        HttpResponseMessage registerResponse = await client.PostAsJsonAsync("/auth/register", registerRequest, TestContext.Current.CancellationToken);
        AuthResult? registerResult = await registerResponse.Content.ReadFromJsonAsync<AuthResult>(TestContext.Current.CancellationToken);

        await client.PostAsJsonAsync("/auth/logout", new LogoutRequest { refreshToken = registerResult!.refreshToken }, TestContext.Current.CancellationToken);

        RefreshRequest refreshRequest = new RefreshRequest
        {
            accessToken = registerResult.accessToken,
            refreshToken = registerResult.refreshToken
        };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/refresh", refreshRequest, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithUsernameOverMaxLength_ReturnsBadRequest()
    {
        //arrange
        RegisterRequest request = new RegisterRequest { username = new string('u', 33), email = "lmlongname@email.com", password = "Test123!" };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithPasswordUnderMinLength_ReturnsBadRequest()
    {
        //arrange
        RegisterRequest request = new RegisterRequest { username = "lmshortpass", email = "lmshortpass@email.com", password = "Test123" };

        //act
        HttpResponseMessage response = await client.PostAsJsonAsync("/auth/register", request, TestContext.Current.CancellationToken);

        //assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}