defmodule LspConfig do
  # lsp.json (repo root) -> the relay's LSP server table. Pure except
  # resolve_command/1 (PATH lookup) and find_root/3 (walks the real FS).
  #
  # Shape:
  #   { "autostart": bool,
  #     "servers": { "<languageId>": { "command": [str, ...],
  #                                    "rootMarkers": [str, ...],
  #                                    "editor": { "command": [...],
  #                                                "rootMarkers": [...] } } } }
  #
  # languageId keys match lib/code/code-languages.js ids (the editor resolves a
  # filename to one of those and sends it on /lsp attach). The server id used
  # for the (root, serverId) registry key is just the language key -- one
  # server per language in v0.
  #
  # "editor" (optional): a different server for the editor
  # (code-editor.js attaches with "client":"editor"). Other /lsp clients --
  # xipe_totec's Scanner.Lsp -- keep the main one. For elixir: the editor
  # gets a syntax check (efm) outside a mix project, where elixir-ls reports
  # nothing, while Xipe Totec keeps elixir-ls's documentSymbol/outgoingCalls.
  # Its id is "<lang>:editor", so it is a separate process in the registry.
  # rootMarkers default to the main entry's.

  @default_markers [".git"]

  @doc """
  Normalise a decoded lsp.json map. Returns
  `{:ok, %{autostart: bool, servers: %{lang => server}}}` where each `server`
  is `%{id: lang, command: [String.t()], root_markers: [String.t()]}`.
  A bad top-level shape is fatal (`{:error, reason}`); a bad individual server
  entry is dropped with a warning string collected in `:problems`.
  """
  def normalize(doc) when is_map(doc) do
    servers_in = Map.get(doc, "servers", %{})

    cond do
      not is_map(servers_in) ->
        {:error, ~s("servers" must be an object)}

      true ->
        {servers, problems} =
          Enum.reduce(servers_in, {%{}, []}, fn {lang, raw}, {acc, probs} ->
            case normalize_server(lang, raw) do
              {:ok, srv} -> {Map.put(acc, lang, srv), probs}
              {:error, why} -> {acc, ["server #{inspect(lang)}: #{why}" | probs]}
            end
          end)

        {:ok,
         %{
           autostart: Map.get(doc, "autostart", true) == true,
           servers: servers,
           problems: Enum.reverse(problems)
         }}
    end
  end

  def normalize(_), do: {:error, "lsp.json is not an object"}

  defp normalize_server(lang, raw) when is_binary(lang) and is_map(raw) do
    with {:ok, srv} <- normalize_one(lang, raw, @default_markers) do
      case Map.get(raw, "editor") do
        nil ->
          {:ok, Map.put(srv, :editor, nil)}

        ed when is_map(ed) ->
          case normalize_one(lang <> ":editor", ed, srv.root_markers) do
            {:ok, e} -> {:ok, Map.put(srv, :editor, e)}
            {:error, why} -> {:error, "editor: " <> why}
          end

        _ ->
          {:error, ~s("editor" must be an object)}
      end
    end
  end

  defp normalize_server(_lang, _raw), do: {:error, "entry must be an object"}

  defp normalize_one(id, raw, default_markers) do
    cmd = Map.get(raw, "command")
    markers = Map.get(raw, "rootMarkers", default_markers)

    cond do
      not (is_list(cmd) and cmd != [] and Enum.all?(cmd, &is_binary/1)) ->
        {:error, ~s("command" must be a non-empty array of strings)}

      not (is_list(markers) and Enum.all?(markers, &is_binary/1)) ->
        {:error, ~s("rootMarkers" must be an array of strings)}

      true ->
        io = Map.get(raw, "initializationOptions")

        {:ok,
         %{
           id: id,
           command: cmd,
           root_markers: if(markers == [], do: default_markers, else: markers),
           init_options: if(is_map(io), do: io, else: nil)
         }}
    end
  end

  @doc """
  Look up the server for a language id. `{:ok, server}` or `:error`.
  `client` is the attach's "client": "editor" picks the entry's `editor`
  server when it has one; anything else (nil) the main one.
  """
  def server_for(cfg, lang, client \\ nil)

  def server_for(%{servers: servers}, lang, client) when is_binary(lang) do
    case Map.fetch(servers, lang) do
      {:ok, %{editor: %{} = ed}} when client == "editor" -> {:ok, ed}
      {:ok, srv} -> {:ok, srv}
      :error -> :error
    end
  end

  def server_for(_, _, _), do: :error

  @doc """
  Resolve a server's `command` against PATH, like PtyValidate.validate_cmd/1.
  `{:ok, [charlist]}` ready for `:exec.run/2`, or `{:error, reason}`.
  `path` (a PATH string): the project's (D-project-env); nil is the relay's own.
  """
  def resolve_command(server, path \\ nil)

  def resolve_command(%{command: [exe | args]}, path) when is_binary(exe) do
    found =
      if is_binary(path),
        do: ProjectEnvConfig.find_executable(exe, path),
        else: System.find_executable(exe)

    case found do
      nil -> {:error, "LSP command not found on PATH: #{inspect(exe)}"}
      full -> {:ok, [String.to_charlist(full) | Enum.map(args, &String.to_charlist/1)]}
    end
  end

  def resolve_command(_, _), do: {:error, "server has no command"}

  @doc """
  Project root for `abs_path` (an absolute file path): the nearest ancestor
  directory that contains one of `markers`, searched from the file's directory
  up to (and not above) `fs_root`. Falls back to `fs_root`. `abs_path` is
  assumed already validated as inside `fs_root` (FsValidate.resolve/2).
  """
  def find_root(abs_path, markers, fs_root)
      when is_binary(abs_path) and is_list(markers) and is_binary(fs_root) do
    root = Path.expand(fs_root)
    start = Path.dirname(Path.expand(abs_path))
    walk_up(start, root, markers)
  end

  defp walk_up(dir, root, markers) do
    cond do
      has_marker?(dir, markers) ->
        dir

      dir == root or not under?(dir, root) ->
        root

      true ->
        parent = Path.dirname(dir)
        if parent == dir, do: root, else: walk_up(parent, root, markers)
    end
  end

  defp has_marker?(dir, markers) do
    Enum.any?(markers, fn m -> File.exists?(Path.join(dir, m)) end)
  end

  defp under?(dir, root) do
    dir == root or String.starts_with?(dir, root <> "/")
  end
end
