using Testcontainers.PostgreSql;

namespace Backend.Tests.Helpers;

// one throwaway Postgres container for the whole test run, shared by every test class's factory;
// Testcontainers removes it when the test process exits, and the API migrates it on startup
public static class TestDatabase
{
    private static readonly SemaphoreSlim startLock = new SemaphoreSlim(1, 1);
    private static PostgreSqlContainer? container;

    public static async Task<string> GetConnectionString()
    {
        await startLock.WaitAsync();

        try
        {
            if (container == null)
            {
                PostgreSqlContainer newContainer = new PostgreSqlBuilder("postgres:17")
                    .WithDatabase("messaging_app")
                    .Build();

                await newContainer.StartAsync();
                container = newContainer;
            }

            return container.GetConnectionString();
        }
        finally
        {
            startLock.Release();
        }
    }
}
