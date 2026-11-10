{:ok, _} = Application.ensure_all_started(:gun)
{:ok, _} = Application.ensure_all_started(:cowboy)

Code.require_file("lib/relay/vent_uplink.exs", __DIR__)
Code.require_file("lib/relay/allowed_origins.exs", __DIR__)
Code.require_file("lib/relay/allowed_hosts.exs", __DIR__)
Code.require_file("lib/relay/tickets.exs", __DIR__)
Code.require_file("lib/relay/secret_gate.exs", __DIR__)
Code.require_file("lib/relay/ticket_handler.exs", __DIR__)
Code.require_file("lib/relay/browser_socket.exs", __DIR__)
Code.require_file("lib/relay/project_env_config.exs", __DIR__)
Code.require_file("lib/relay/project_env.exs", __DIR__)
Code.require_file("lib/relay/pty_validate.exs", __DIR__)
Code.require_file("lib/relay/pty_flow.exs", __DIR__)
Code.require_file("lib/relay/pty_socket.exs", __DIR__)
Code.require_file("lib/relay/windows_handler.exs", __DIR__)
Code.require_file("lib/relay/fs_validate.exs", __DIR__)
Code.require_file("lib/relay/fs_handler.exs", __DIR__)
Code.require_file("lib/relay/env_handler.exs", __DIR__)
Code.require_file("lib/relay/mirror.exs", __DIR__)
Code.require_file("lib/relay/juncture.exs", __DIR__)
Code.require_file("lib/relay/id_pool.exs", __DIR__)
Code.require_file("lib/relay/lsp_framing.exs", __DIR__)
Code.require_file("lib/relay/lsp_config.exs", __DIR__)
Code.require_file("lib/relay/lsp_owners.exs", __DIR__)
Code.require_file("lib/relay/lsp_server.exs", __DIR__)
Code.require_file("lib/relay/lsp_registry.exs", __DIR__)
Code.require_file("lib/relay/lsp_socket.exs", __DIR__)
Code.require_file("lib/relay/lsp_handler.exs", __DIR__)
Code.require_file("lib/relay/xipe_config.exs", __DIR__)
Code.require_file("lib/relay/xipe_conn.exs", __DIR__)
Code.require_file("lib/relay/xipe_registry.exs", __DIR__)
Code.require_file("lib/relay/xipe_socket.exs", __DIR__)
Code.require_file("lib/relay/sql.exs", __DIR__)

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

{:ok, _} = Application.ensure_all_started(:myxql)

{:ok, _} =
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
       {"/ticket", TicketHandler, []},
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

Process.sleep(:infinity)
