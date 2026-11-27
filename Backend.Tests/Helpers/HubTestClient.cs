using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;

namespace Backend.Tests.Helpers;

// a SignalR connection to the in-memory test server that records every event it receives, so a test can wait for one
public sealed class HubTestClient : IAsyncDisposable
{
    private static readonly TimeSpan EventTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan QuietPeriod = TimeSpan.FromMilliseconds(500);

    // the server-to-client events the tests listen for, with the argument types the backend sends
    private static readonly Dictionary<string, Type[]> EventArgumentTypes = new Dictionary<string, Type[]>
    {
        ["ReceiveChannelMessage"] = new[] { typeof(long), typeof(long), typeof(SendMessageResult) },
        ["ChannelMessageEdited"] = new[] { typeof(long), typeof(long), typeof(string) },
        ["ChannelMessageDeleted"] = new[] { typeof(long), typeof(long) },
        ["ChannelTyping"] = new[] { typeof(long), typeof(string), typeof(string) },
        ["ConversationTyping"] = new[] { typeof(long), typeof(string), typeof(string) },
        ["ReceiveConversationMessage"] = new[] { typeof(long), typeof(SendMessageResult) },
        ["ConversationMemberLeft"] = new[] { typeof(long), typeof(string) },
        ["MemberJoined"] = new[] { typeof(long), typeof(UserResult) },
        ["MemberKicked"] = new[] { typeof(long), typeof(string) },
        ["OwnerChanged"] = new[] { typeof(long), typeof(string) },
        ["ServerJoined"] = new[] { typeof(ServerResult) },
        ["UserStatusChanged"] = new[] { typeof(string), typeof(ActivityStatus) }
    };

    private readonly HubConnection connection;
    private readonly ConcurrentDictionary<string, Channel<object?[]>> eventsByName = new ConcurrentDictionary<string, Channel<object?[]>>();

    private HubTestClient(HubConnection connection)
    {
        this.connection = connection;

        foreach (KeyValuePair<string, Type[]> hubEvent in EventArgumentTypes)
        {
            connection.On(hubEvent.Key, hubEvent.Value, (arguments, state) =>
            {
                GetEvents((string)state).Writer.TryWrite(arguments);
                return Task.CompletedTask;
            }, hubEvent.Key);
        }
    }

    public static HubConnection CreateConnection(TestWebApplicationFactory factory, string? accessToken)
    {
        return new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, "hubs/chat"), options =>
            {
                // long polling goes through the test server's HTTP handler, which WebSockets can't
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult(accessToken);
            })
            .Build();
    }

    public static async Task<HubTestClient> Connect(TestWebApplicationFactory factory, string accessToken)
    {
        HubTestClient hubClient = new HubTestClient(CreateConnection(factory, accessToken));
        await hubClient.connection.StartAsync(TestContext.Current.CancellationToken);

        // the hub only runs method calls after OnConnectedAsync finishes, so this returns once the connection has joined its groups
        await hubClient.connection.InvokeAsync("StartConversationTyping", 0L, TestContext.Current.CancellationToken);

        return hubClient;
    }

    public async Task Invoke(string methodName, object argument)
    {
        await connection.InvokeAsync(methodName, argument, TestContext.Current.CancellationToken);
    }

    // the arguments of the next event with this name, failing the test if none arrives in time
    public async Task<object?[]> Next(string eventName)
    {
        using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        timeout.CancelAfter(EventTimeout);

        try
        {
            return await GetEvents(eventName).Reader.ReadAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!TestContext.Current.CancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"No {eventName} event arrived within {EventTimeout.TotalSeconds} seconds.");
        }
    }

    // waits a moment, then checks this event never arrived
    public async Task AssertNoEvent(string eventName)
    {
        await Task.Delay(QuietPeriod, TestContext.Current.CancellationToken);

        Assert.False(GetEvents(eventName).Reader.TryRead(out object?[]? arguments), $"Expected no {eventName} event, got ({string.Join(", ", arguments ?? Array.Empty<object?>())}).");
    }

    public async Task Disconnect()
    {
        await connection.StopAsync(TestContext.Current.CancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        await connection.DisposeAsync();
    }

    private Channel<object?[]> GetEvents(string eventName)
    {
        if (!EventArgumentTypes.ContainsKey(eventName))
        {
            throw new ArgumentException($"{eventName} isn't in HubTestClient's list of events.", nameof(eventName));
        }

        return eventsByName.GetOrAdd(eventName, _ => System.Threading.Channels.Channel.CreateUnbounded<object?[]>());
    }
}
