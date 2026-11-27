using Backend.Tests.Helpers;
using Messaging_App.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Backend.Tests.Integration;

public class DatabaseCleanupServiceTests : IntegrationTestBase
{
    public DatabaseCleanupServiceTests(TestWebApplicationFactory factory) : base(factory)
    {
    }

    // the factory turns the timer off, so tests call one pass directly
    private async Task RunCleanup()
    {
        DatabaseCleanupService cleanupService = factory.Services.GetServices<IHostedService>().OfType<DatabaseCleanupService>().Single();
        await cleanupService.RunCleanup(TestContext.Current.CancellationToken);
    }

    private async Task<long> GetUserId(string username)
    {
        return await WithDatabase(async db => await db.Users.Where(user => user.username == username).Select(user => user.id).SingleAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task RunCleanup_DeletesExpiredTokensAndKeepsRevokedOnesThatHaveNotExpired()
    {
        //arrange
        await RegisterAndGetToken("dccleantokens");
        long userId = await GetUserId("dccleantokens");
        DateTimeOffset now = DateTimeOffset.UtcNow;
        RefreshToken expiredToken = new RefreshToken { userID = userId, token = Guid.NewGuid().ToString(), createdDate = now.AddDays(-8), expiresDate = now.AddDays(-1) };
        RefreshToken revokedToken = new RefreshToken { userID = userId, token = Guid.NewGuid().ToString(), revoked = true, createdDate = now.AddDays(-1), expiresDate = now.AddDays(6) };
        RefreshToken activeToken = new RefreshToken { userID = userId, token = Guid.NewGuid().ToString(), createdDate = now, expiresDate = now.AddDays(7) };
        await WithDatabase(async db =>
        {
            db.RefreshTokens.AddRange(expiredToken, revokedToken, activeToken);
            return await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        //act
        await RunCleanup();

        //assert: revoked tokens stay until they expire, since Refresh needs them to spot a reused token
        List<long> remainingIds = await WithDatabase(async db => await db.RefreshTokens.Where(token => token.userID == userId).Select(token => token.id).ToListAsync(TestContext.Current.CancellationToken));
        Assert.DoesNotContain(expiredToken.id, remainingIds);
        Assert.Contains(revokedToken.id, remainingIds);
        Assert.Contains(activeToken.id, remainingIds);
    }

    [Fact]
    public async Task RunCleanup_DeletesInvitesPastTheRetentionPeriod()
    {
        //arrange
        (_, long serverId) = await CreateServerAndGetId("dccleaninvites");
        long userId = await GetUserId("dccleaninvites");
        DateTimeOffset now = DateTimeOffset.UtcNow;
        ServerInvite longExpired = new ServerInvite { inviteCode = Guid.NewGuid(), serverID = serverId, createdBy = userId, createdDate = now.AddDays(-50), expiresDate = now.AddDays(-40) };
        ServerInvite recentlyExpired = new ServerInvite { inviteCode = Guid.NewGuid(), serverID = serverId, createdBy = userId, createdDate = now.AddDays(-2), expiresDate = now.AddDays(-1) };
        ServerInvite oldUsedUp = new ServerInvite { inviteCode = Guid.NewGuid(), serverID = serverId, createdBy = userId, createdDate = now.AddDays(-40), maxUses = 1, uses = 1 };
        ServerInvite recentUsedUp = new ServerInvite { inviteCode = Guid.NewGuid(), serverID = serverId, createdBy = userId, createdDate = now.AddDays(-1), maxUses = 1, uses = 1 };
        ServerInvite oldUnlimited = new ServerInvite { inviteCode = Guid.NewGuid(), serverID = serverId, createdBy = userId, createdDate = now.AddDays(-40) };
        await WithDatabase(async db =>
        {
            db.ServerInvites.AddRange(longExpired, recentlyExpired, oldUsedUp, recentUsedUp, oldUnlimited);
            return await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        });

        //act
        await RunCleanup();

        //assert
        List<Guid> remainingCodes = await WithDatabase(async db => await db.ServerInvites.Where(invite => invite.serverID == serverId).Select(invite => invite.inviteCode).ToListAsync(TestContext.Current.CancellationToken));
        Assert.DoesNotContain(longExpired.inviteCode, remainingCodes);
        Assert.DoesNotContain(oldUsedUp.inviteCode, remainingCodes);
        Assert.Contains(recentlyExpired.inviteCode, remainingCodes);
        Assert.Contains(recentUsedUp.inviteCode, remainingCodes);
        Assert.Contains(oldUnlimited.inviteCode, remainingCodes);
    }
}
