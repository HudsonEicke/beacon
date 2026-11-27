using Npgsql;
using Testcontainers.PostgreSql;

namespace Backend.Tests.Helpers;

// one throwaway Postgres container for the whole test run, shared by every test class's factory;
// Testcontainers removes it when the test process exits
public static class TestDatabase
{
    private const string DatabaseName = "messaging_app";

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
                    // the schema script creates messaging_app itself, so it runs as an init script against the default database
                    .WithResourceMapping(new FileInfo(FindSchemaScript()), "/docker-entrypoint-initdb.d/")
                    .Build();

                await newContainer.StartAsync();
                container = newContainer;
            }

            NpgsqlConnectionStringBuilder connectionString = new NpgsqlConnectionStringBuilder(container.GetConnectionString())
            {
                Database = DatabaseName
            };

            return connectionString.ConnectionString;
        }
        finally
        {
            startLock.Release();
        }
    }

    private static string FindSchemaScript()
    {
        DirectoryInfo? directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory != null)
        {
            string schemaPath = Path.Combine(directory.FullName, "Database", "messagingapp.sql");

            if (File.Exists(schemaPath))
            {
                return schemaPath;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException("Could not find Database/messagingapp.sql above the test output folder.");
    }
}
