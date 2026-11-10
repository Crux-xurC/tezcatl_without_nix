defmodule TezcatlRelay.Application do
  # Upstream's main.exs, as an OTP application. main.exs loads lib/relay/ with
  # Code.require_file and runs at the top level; here Mix compiles lib/relay/
  # and this start/2 does the rest. Keep the body in step with main.exs:
  # sync/sync.sh warns when main.exs changed and shows the difference.
  #
  # Like main.exs, it reads the environment (TEZCATL_RELAY_PORT, POCA_SECRET /
  # TEZCATL_AUTH, TEZCATL_VENT_HOST / _PORT, TEZCATL_FS_ROOT ...) and runs in
  # the tezcatl directory (config.json, lsp.json, xipe.json are read from the
  # current directory).
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    browser_port = String.to_integer(System.get_env("TEZCATL_RELAY_PORT") || "4100")

    # Poca's secret (D-poca-secret): without one, run only when told to
    auth =
      case SecretGate.mode_from_env() do
        :missing ->
          IO.puts(
            :stderr,
            "tezcatl relay: no POCA_SECRET -- start tezcatl from Poca, or set TEZCATL_AUTH=off " <>
              "(t --no-auth) to run it without authentication"
          )

          System.halt(1)

        mode ->
          SecretGate.configure(mode)
          mode
      end

    emacs_host = System.get_env("TEZCATL_VENT_HOST") || "127.0.0.1"
    emacs_port = String.to_integer(System.get_env("TEZCATL_VENT_PORT") || "4000")

    children = [
      {VentUplink, %{host: emacs_host, port: emacs_port}},
      {DynamicSupervisor, name: Tezcatl.LspSup, strategy: :one_for_one},
      LspRegistry,
      {DynamicSupervisor, name: Tezcatl.XipeSup, strategy: :one_for_one},
      XipeRegistry,
      # the copies of what code_editor edits
      MirrorStore,
      # the points kept of a file, as a tree (D-juncture); thrown away at start
      JunctureStore,
      # the id lists a note's marks are replaced with (D-id-pool)
      IdPool,
      # one-shot tickets for WebSocket handshakes (D-poca-secret)
      Tickets,
      # the projects' environments, asked once each (D-project-env)
      ProjectEnv,
      # the numbered database windows (D-db-session); each window's session is its own, logged in by a person
      DbWindows
    ]

    {:ok, sup} =
      Supervisor.start_link(children, strategy: :one_for_one, name: Tezcatl.Relay.Supervisor)

    dispatch =
      :cowboy_router.compile([
        {:_,
         [
           {"/", BrowserSocket, []},
           {"/pty", PtySocket, []},
           {"/windows", WindowsHandler, []},
           {"/windows/:id", WindowsHandler, []},
           {"/fs", FsHandler, []},
           {"/fs/read", FsHandler, []},
           {"/fs/write", FsHandler, []},
           {"/fs/delete", FsHandler, []},
           {"/fs/rename", FsHandler, []},
           {"/fs/grep", FsHandler, []},
           {"/fs/stat", FsHandler, []},
           {"/fs/clone", FsHandler, []},
           {"/env", EnvHandler, []},
           {"/env/reload", EnvHandler, []},
           {"/mirror", MirrorHandler, []},
           {"/mirror/list", MirrorHandler, []},
           {"/mirror/close", MirrorHandler, []},
           {"/mirror/drop", MirrorHandler, []},
           {"/juncture/set", JunctureHandler, []},
           {"/juncture/point", JunctureHandler, []},
           {"/juncture/current", JunctureHandler, []},
           {"/juncture/tree", JunctureHandler, []},
           {"/juncture/list", JunctureHandler, []},
           {"/ids/take", IdPoolHandler, []},
           {"/lsp", LspSocket, []},
           {"/lsp/servers", LspHandler, []},
           {"/lsp/servers/:key", LspHandler, []},
           {"/xipe", XipeSocket, []},
           {"/sql", SqlSocket, []},
           {"/sql/windows", SqlWindowsHandler, []},
           {"/ticket", TicketHandler, []}
         ]}
      ])

    case :cowboy.start_clear(
           :tezcatl_relay,
           %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, browser_port}]},
           # AllowedHosts first: the Host gate covers every route; then Poca's secret
           %{
             env: %{dispatch: dispatch},
             middlewares: [AllowedHosts, SecretGate, :cowboy_router, :cowboy_handler]
           }
         ) do
      {:ok, _} ->
        :ok

      {:error, :eaddrinuse} ->
        IO.puts(
          :stderr,
          "tezcatl relay: 127.0.0.1:#{browser_port} is in use " <>
            "(another relay running? change it with TEZCATL_RELAY_PORT)"
        )

        System.halt(1)

      {:error, reason} ->
        IO.puts(:stderr, "tezcatl relay: could not start the listener: #{inspect(reason)}")
        System.halt(1)
    end

    # not in main.exs: the pages, which upstream's nix/t serves with python3
    case TezcatlRelay.Pages.start() do
      :ok ->
        if TezcatlRelay.Pages.port() != "off" do
          IO.puts(
            "tezcatl pages: http://127.0.0.1:#{TezcatlRelay.Pages.port()}/main.html  " <>
              "(#{TezcatlRelay.Pages.pages_dir()})"
          )
        end

      {:error, :eaddrinuse} ->
        IO.puts(
          :stderr,
          "tezcatl pages: 127.0.0.1:#{TezcatlRelay.Pages.port()} is in use " <>
            "(change it with TEZCATL_PAGES_PORT, or \"off\")"
        )

        System.halt(1)

      {:error, reason} ->
        IO.puts(:stderr, "tezcatl pages: could not start the listener: #{inspect(reason)}")
        System.halt(1)
    end

    IO.puts(
      "tezcatl relay: browsers on ws://127.0.0.1:#{browser_port}/  ->  emacs-vent #{emacs_host}:#{emacs_port}" <>
        "  (/pty for PTY; /lsp for language servers; GET /windows, GET /lsp/servers for the ledgers)"
    )

    IO.puts(
      (fn sv ->
         "tezcatl relay: /sql -> MariaDB #{sv.hostname}:#{sv.port} database #{sv.database}, " <>
           "for database windows a person logs in to (offered first: #{sv.account || "no account"})"
       end).(Sql.server())
    )

    IO.puts(
      case auth do
        {:secret, _} -> "tezcatl relay: authentication on (Poca's secret; WebSockets by ticket)"
        :off -> "tezcatl relay: authentication OFF (TEZCATL_AUTH=off) -- any local page can use the relay"
      end
    )

    {:ok, sup}
  end
end
