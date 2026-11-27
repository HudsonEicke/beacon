using System.ComponentModel.DataAnnotations;

namespace Messaging_App.Configuration;

public class RateLimitSettings
{
    //login and register requests allowed per IP in each window
    [Range(1, 10_000)]
    public int AuthPermitLimit { get; set; } = 10;

    [Range(1, 60)]
    public int AuthWindowMinutes { get; set; } = 1;
}
