defmodule XipeConfig do
  # xipe.json (repo root) -> the relay's Xipe Totec project table. Pure except
  # resolve_command/1 (PATH lookup), mirrors LspConfig's shape and role.
  #
  # Shape:
  #   { "<root>": { "mode": "spawn",
  #                 "installDir": <path to the xipe_totec checkout>,
  #                 "command": [str, ...],   -- argv prefix, run with cwd=installDir
  #                 "port": <int> }
  #              | { "mode": "connect", "host": <str>, "port": <int> } }
  #
  # "<root>" is only a name the browser's attach message picks an entry by
  # ("." by default) -- not a path. Which project a Xipe Totec server has
  # open is Xipe Totec's own choice (`xipe choice project`); tezcatl is only
  # a window onto it, and learns the project from `initialize`'s result.
  #
  # "installDir"/"command" are split (unlike lsp.json's single "command")
  # because Xipe Totec isn't installed as a `xipe` executable on PATH here --
  # it's a source checkout run as `elixir main.exs serve --port <p> ...`
  # with cwd = the checkout.

  @doc """
  Normalise a decoded xipe.json map. Returns
  `{:ok, %{projects: %{root_key => project}, problems: [String.t()]}}` where
  each `project` is `%{root_key: root_key, mode: :spawn | :connect, ...}`.
  A bad top-level shape is fatal (`{:error, reason}`); a bad individual entry
  is dropped with a warning string collected in `:problems`.
  """
  def normalize(doc) when is_map(doc) do
    {projects, problems} =
      Enum.reduce(doc, {%{}, []}, fn {root_key, raw}, {acc, probs} ->
        case normalize_project(root_key, raw) do
          {:ok, proj} -> {Map.put(acc, root_key, proj), probs}
          {:error, why} -> {acc, ["project #{inspect(root_key)}: #{why}" | probs]}
        end
      end)

    {:ok, %{projects: projects, problems: Enum.reverse(problems)}}
  end

  def normalize(_), do: {:error, "xipe.json is not an object"}

  defp normalize_project(root_key, %{"mode" => "spawn"} = raw) when is_binary(root_key) do
    install_dir = Map.get(raw, "installDir")
    cmd = Map.get(raw, "command")
    port = Map.get(raw, "port")

    cond do
      not (is_binary(install_dir) and install_dir != "") ->
        {:error, ~s("installDir" must be a non-empty string)}

      not (is_list(cmd) and cmd != [] and Enum.all?(cmd, &is_binary/1)) ->
        {:error, ~s("command" must be a non-empty array of strings)}

      not (is_integer(port) and port > 0) ->
        {:error, ~s("port" must be a positive integer)}

      true ->
        {:ok, %{root_key: root_key, mode: :spawn, install_dir: install_dir, command: cmd, port: port}}
    end
  end

  defp normalize_project(root_key, %{"mode" => "connect"} = raw) when is_binary(root_key) do
    host = Map.get(raw, "host")
    port = Map.get(raw, "port")

    cond do
      not (is_binary(host) and host != "") ->
        {:error, ~s("host" must be a non-empty string)}

      not (is_integer(port) and port > 0) ->
        {:error, ~s("port" must be a positive integer)}

      true ->
        {:ok, %{root_key: root_key, mode: :connect, host: host, port: port}}
    end
  end

  defp normalize_project(_root_key, %{"mode" => other}), do: {:error, "unknown mode #{inspect(other)}"}
  defp normalize_project(_root_key, _raw), do: {:error, ~s("mode" must be "spawn" or "connect")}

  @doc "Look up the project for a root key. `{:ok, project}` or `:error`."
  def project_for(%{projects: projects}, root_key) when is_binary(root_key) do
    Map.fetch(projects, root_key)
  end

  def project_for(_, _), do: :error

  @doc """
  Resolve a spawn project's `command` against PATH, like LspConfig.resolve_command/1.
  `{:ok, [charlist]}` ready for `:exec.run/2`, or `{:error, reason}`.
  """
  def resolve_command(%{command: [exe | args]}) when is_binary(exe) do
    case System.find_executable(exe) do
      nil -> {:error, "xipe spawn command not found on PATH: #{inspect(exe)}"}
      path -> {:ok, [String.to_charlist(path) | Enum.map(args, &String.to_charlist/1)]}
    end
  end

  def resolve_command(_), do: {:error, "project has no command"}

  @doc """
  The argv tail a spawn project's `command` gets: its `--port`, and where
  this relay's own `/lsp` is (`--lsp`, `--fs-root`), so the spawned xipe's
  language-server scans share the editor's server instead of starting one
  of their own. No target directory: xipe serves its own selected project.
  `relay` is `%{port: <this relay's port>, fs_root: <TEZCATL_FS_ROOT or the
  relay's cwd>}` -- the same two values LspSocket resolves attach paths
  against.
  """
  def spawn_args(%{port: port}, %{port: relay_port, fs_root: fs_root}) do
    ["--port", to_string(port), "--lsp", "ws://127.0.0.1:#{relay_port}/lsp", "--fs-root", fs_root]
  end
end
