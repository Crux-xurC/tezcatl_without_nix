defmodule AllowedHosts do
  # The Host-header gate, run as a cowboy middleware ahead of
  # the router so it covers every route. It closes what the Origin check
  # cannot: DNS rebinding. A page on evil.example whose name is re-pointed at
  # 127.0.0.1 talks to the relay as its *own* origin, and a same-origin GET
  # carries no Origin header -- so `GET /fs/read` etc. would read it all. The
  # browser still sends the name it dialled in `Host` (page JS cannot set
  # it), and that name is the attacker's, never a loopback one.
  #
  # Only the hostname is compared, not the port: an attacker's Host is
  # always its own domain, so moving TEZCATL_RELAY_PORT or forwarding to
  # another port over SSH needs no setting. Like the Origin check this is not
  # authentication -- it only reads a value the browser sets by itself.
  #
  # TEZCATL_ALLOWED_HOSTS (comma-separated hostnames, no port) adds names to
  # the loopback defaults, e.g. an /etc/hosts alias you browse the relay by.

  @behaviour :cowboy_middleware
  require Logger

  @default_hosts ["127.0.0.1", "localhost", "[::1]"]

  def list do
    extra =
      (System.get_env("TEZCATL_ALLOWED_HOSTS") || "")
      |> String.split(",")
      |> Enum.map(&(&1 |> String.trim() |> String.downcase()))
      |> Enum.reject(&(&1 == ""))

    Enum.uniq(@default_hosts ++ extra)
  end

  # `host` is cowboy's parsed hostname (port already split off). An empty
  # one is a request with no Host at all -- HTTP/1.0 from a local program;
  # browsers always send Host, so it is let through like a missing Origin.
  def check(""), do: :ok

  def check(host) when is_binary(host) do
    if String.downcase(host) in list(), do: :ok, else: {:error, host}
  end

  def check(other), do: {:error, other}

  @impl true
  def execute(req, env) do
    case check(:cowboy_req.host(req)) do
      :ok ->
        {:ok, req, env}

      {:error, host} ->
        Logger.info("relay: rejecting #{:cowboy_req.path(req)}, disallowed Host #{inspect(host)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden host\n", req)
        {:stop, req}
    end
  end
end
