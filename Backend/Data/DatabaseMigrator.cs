using System.Reflection;
using DbUp;
using DbUp.Engine;
using Npgsql;

namespace Messaging_App.Data;

public static class DatabaseMigrator
{
    private const string ScriptPrefix = "Messaging_App.Data.Migrations.";
    private const long MigrationLockKey = 7_346_215_001;

    public static void MigrateDatabase(this WebApplication app)
    {
        string connectionString = app.Configuration.GetConnectionString("MessagingAppContext") ?? throw new InvalidOperationException("The MessagingAppContext connection string is not configured.");
        ILoggerFactory loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();

        Migrate(connectionString, loggerFactory);
    }

    public static void Migrate(string connectionString, ILoggerFactory loggerFactory)
    {
        // several API instances (e.g. the integration tests' factories) can start against the same database at once,
        // so a session-level advisory lock makes them migrate one at a time
        using NpgsqlConnection lockConnection = new NpgsqlConnection(connectionString);
        lockConnection.Open();
        ExecuteLockCommand(lockConnection, "SELECT pg_advisory_lock(@key)");

        try
        {
            UpgradeEngine upgrader = DeployChanges.To
                .PostgresqlDatabase(connectionString)
                .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), scriptName => scriptName.StartsWith(ScriptPrefix, StringComparison.Ordinal))
                .WithTransactionPerScript()
                .WithVariablesDisabled()
                .LogTo(loggerFactory)
                .Build();

            DatabaseUpgradeResult result = upgrader.PerformUpgrade();

            if (!result.Successful)
            {
                throw new InvalidOperationException($"Database migration {result.ErrorScript?.Name} failed.", result.Error);
            }
        }
        finally
        {
            ExecuteLockCommand(lockConnection, "SELECT pg_advisory_unlock(@key)");
        }
    }

    private static void ExecuteLockCommand(NpgsqlConnection connection, string sql)
    {
        using NpgsqlCommand command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("key", MigrationLockKey);
        command.ExecuteNonQuery();
    }
}
