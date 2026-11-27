using System.Text;
using Messaging_App.Configuration;
using Messaging_App.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Tests.Helpers;

public class TestWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string TestJwtKey = "test-secret-key-32-chars-minimum!";
    private const string TestJwtIssuer = "http://localhost";
    private const string TestJwtAudience = "MessagingAppAPI";

    private string connectionString = string.Empty;

    public async ValueTask InitializeAsync()
    {
        connectionString = await TestDatabase.GetConnectionString();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // tests never edit appsettings while running, and watching for changes hangs startup when the Windows SDK runs the tests from a WSL path
        builder.UseSetting("hostBuilder:reloadConfigOnChange", "false");

        builder.ConfigureAppConfiguration((context, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:MessagingAppContext"] = connectionString,
                ["JwtSettings:SecretKey"] = TestJwtKey,
                ["JwtSettings:Issuer"] = TestJwtIssuer,
                ["JwtSettings:Audience"] = TestJwtAudience,
                ["JwtSettings:AccessTokenExpirationMinutes"] = "15",
                ["JwtSettings:RefreshTokenExpirationDays"] = "7",
                ["EncryptionSettings:SecretKey"] = "test-encryption-key-32-chars-min",
                ["CleanupSettings:Enabled"] = "false",
                ["Logging:LogLevel:Microsoft.EntityFrameworkCore"] = "Warning",
                ["Logging:LogLevel:Microsoft.Hosting.Lifetime"] = "Warning"
            });
        });

        builder.ConfigureTestServices(services =>
        {
            // Program reads the connection string while it registers the DbContext, before the settings above apply, so it's replaced here
            // too (the migration runs after Build, so it sees them); UseNpgsql keeps the enum mappings Program set up
            services.ConfigureDbContext<MessagingAppContext>(options => options.UseNpgsql(connectionString));

            services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
                .PostConfigure<IOptions<JwtSettings>>((options, jwtSettings) =>
                {
                    byte[] keyBytes = Encoding.UTF8.GetBytes(jwtSettings.Value.SecretKey);
                    options.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(keyBytes);
                    options.TokenValidationParameters.ValidIssuer = jwtSettings.Value.Issuer;
                    options.TokenValidationParameters.ValidAudience = jwtSettings.Value.Audience;
                });
        });
    }
}
