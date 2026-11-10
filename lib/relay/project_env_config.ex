defmodule ProjectEnvConfig do
  # project_env.json (repo root) -> how the relay gets a project's environment
  # (D-project-env). Pure except read/1 and locate/3 (they look at the disk).
  #
  # Shape:
  #   { "timeoutMs": 120000,
  #     "entries": [ { "marker": "flake.nix",
  #                    "command": ["nix", "print-dev-env", "--json"],
  #                    "format": "nix" }, ... ] }
  #
  # A project's root is the nearest directory, from where a file or a terminal
  # is up to the FS root, that holds one of the markers; in that directory the
  # first entry in order whose marker is there is used. Its command runs there
  # with the relay's own environment and prints JSON in one of two formats:
  #   "env"  {"NAME": "value" | null}   null unsets (direnv export json, mise env --json,
  #                                     a script of one's own); values are taken as they are
  #   "nix"  nix print-dev-env --json   what `nix develop` does with it: the exported
  #                                     variables, without the ones it leaves out (HOME,
  #                                     TMPDIR ...), PATH and XDG_DATA_DIRS put before the
  #                                     relay's own; the shellHook is not run
  # The answer is a change to the relay's environment:
  #   %{set: %{name => value}, unset: [name], path: "<PATH the change makes>"}

  @default_timeout 120_000
  @formats ["env", "nix"]

  # what `nix develop` does not take from the derivation's environment
  @nix_ignored ~w(BASHOPTS HOME NIX_BUILD_TOP NIX_ENFORCE_PURITY NIX_LOG_FD NIX_REMOTE PPID
                  SHELL SHELLOPTS SSL_CERT_FILE TEMP TEMPDIR TERM TMP TMPDIR TZ UID)
  # put before the relay's own value, as `nix develop` does
  @nix_prepended ~w(PATH XDG_DATA_DIRS)

  @doc """
  Normalise a decoded project_env.json. `{:ok, %{timeout_ms, entries, problems}}`
  (each entry `%{marker, command, format}`; broken entries dropped into
  `:problems`) or `{:error, reason}` for a broken top level.
  """
  def normalize(doc) when is_map(doc) do
    entries_in = Map.get(doc, "entries", [])
    timeout = Map.get(doc, "timeoutMs", @default_timeout)

    cond do
      not is_list(entries_in) ->
        {:error, ~s("entries" must be an array)}

      not (is_integer(timeout) and timeout > 0) ->
        {:error, ~s("timeoutMs" must be a positive integer)}

      true ->
        {entries, problems} =
          entries_in
          |> Enum.with_index(1)
          |> Enum.reduce({[], []}, fn {raw, i}, {acc, probs} ->
            case normalize_entry(raw) do
              {:ok, e} -> {[e | acc], probs}
              {:error, why} -> {acc, ["entry #{i}: #{why}" | probs]}
            end
          end)

        {:ok, %{timeout_ms: timeout, entries: Enum.reverse(entries), problems: Enum.reverse(problems)}}
    end
  end

  def normalize(_), do: {:error, "project_env.json is not an object"}

  defp normalize_entry(raw) when is_map(raw) do
    marker = Map.get(raw, "marker")
    cmd = Map.get(raw, "command")
    format = Map.get(raw, "format", "env")

    cond do
      not (is_binary(marker) and marker != "" and not String.contains?(marker, "/")) ->
        {:error, ~s("marker" must be a file name)}

      not (is_list(cmd) and cmd != [] and Enum.all?(cmd, &is_binary/1)) ->
        {:error, ~s("command" must be a non-empty array of strings)}

      format not in @formats ->
        {:error, ~s("format" must be one of #{Enum.join(@formats, ", ")})}

      true ->
        {:ok, %{marker: marker, command: cmd, format: format}}
    end
  end

  defp normalize_entry(_), do: {:error, "entry must be an object"}

  @doc """
  Read and normalise `project_env.json` in `dir`. No file is no entries (every
  process gets the relay's own environment).
  """
  def read(dir) do
    case File.read(Path.join(dir, "project_env.json")) do
      {:ok, bytes} ->
        case decode_json(bytes) do
          {:ok, doc} -> normalize(doc)
          :error -> {:error, "project_env.json is not valid JSON"}
        end

      {:error, :enoent} ->
        {:ok, %{timeout_ms: @default_timeout, entries: [], problems: []}}

      {:error, e} ->
        {:error, "project_env.json: #{inspect(e)}"}
    end
  end

  @doc """
  The project around `dir` (an absolute directory inside `fs_root`):
  `{:ok, root, entry}` for the nearest directory up to `fs_root` holding a
  marker, or `:none`.
  """
  def locate(dir, entries, fs_root) when is_binary(dir) and is_list(entries) do
    root = Path.expand(fs_root)
    walk_up(Path.expand(dir), root, entries)
  end

  defp walk_up(dir, root, entries) do
    case Enum.find(entries, fn e -> File.exists?(Path.join(dir, e.marker)) end) do
      %{} = e ->
        {:ok, dir, e}

      nil ->
        parent = Path.dirname(dir)

        cond do
          dir == root or parent == dir -> :none
          not (parent == root or String.starts_with?(parent, root <> "/")) -> :none
          true -> walk_up(parent, root, entries)
        end
    end
  end

  @doc """
  An entry's output -> `{:ok, %{set, unset, path}}` against the relay's own
  environment `base` (a map), or `{:error, reason}`.
  """
  def decode("env", bytes, base) do
    with {:ok, doc} <- json_object(bytes),
         :ok <- all_env_values(doc) do
      set = for {k, v} when is_binary(v) <- doc, into: %{}, do: {k, v}
      unset = for {k, :null} <- doc, do: k
      {:ok, %{set: set, unset: Enum.sort(unset), path: path_of(set, unset, base)}}
    end
  end

  def decode("nix", bytes, base) do
    with {:ok, doc} <- json_object(bytes),
         %{} = vars <- Map.get(doc, "variables", :missing) do
      set =
        for {k, %{"type" => "exported", "value" => v}} when is_binary(v) <- vars,
            k not in @nix_ignored,
            into: %{} do
          if k in @nix_prepended, do: {k, join_paths(v, Map.get(base, k))}, else: {k, v}
        end

      {:ok, %{set: set, unset: [], path: path_of(set, [], base)}}
    else
      {:error, _} = e -> e
      _ -> {:error, ~s[the output has no "variables" (is it nix print-dev-env --json?)]}
    end
  end

  def decode(format, _bytes, _base), do: {:error, "unknown format #{inspect(format)}"}

  defp all_env_values(doc) do
    # OTP's :json gives null as :null
    case Enum.find(doc, fn {_k, v} -> not (is_binary(v) or v == :null) end) do
      nil -> :ok
      {k, _} -> {:error, "the value of #{k} is neither a string nor null"}
    end
  end

  defp path_of(set, unset, base) do
    cond do
      Map.has_key?(set, "PATH") -> set["PATH"]
      "PATH" in unset -> ""
      true -> Map.get(base, "PATH", "")
    end
  end

  defp join_paths(v, nil), do: v
  defp join_paths(v, ""), do: v
  defp join_paths("", own), do: own
  defp join_paths(v, own), do: v <> ":" <> own

  @doc """
  The directories a change puts before the relay's own PATH (for saying it):
  the leading part of `path` the base PATH does not have there.
  """
  def path_added(path, base_path) when is_binary(path) do
    own = String.split(base_path || "", ":", trim: true)
    mine = String.split(path, ":", trim: true)
    n = length(mine) - length(own)

    if n >= 0 and Enum.drop(mine, n) == own, do: Enum.take(mine, n), else: mine
  end

  @doc "A change as erlexec's {:env, ...} list (unset is {name, false})."
  def exec_env(%{set: set, unset: unset}) do
    Enum.map(set, fn {k, v} -> {String.to_charlist(k), String.to_charlist(v)} end) ++
      Enum.map(unset, fn k -> {String.to_charlist(k), false} end)
  end

  def exec_env(_), do: []

  @doc """
  `exe` on `path` (a PATH string) as System.find_executable/1 does on the
  relay's own: a name with a slash is taken as it is. The full path or nil.
  """
  def find_executable(exe, path) when is_binary(exe) do
    if String.contains?(exe, "/") do
      if executable?(exe), do: Path.expand(exe), else: nil
    else
      (path || "")
      |> String.split(":", trim: true)
      |> Enum.map(&Path.join(&1, exe))
      |> Enum.find(&executable?/1)
    end
  end

  defp executable?(file) do
    case File.stat(file) do
      {:ok, %File.Stat{type: :regular, mode: mode}} -> Bitwise.band(mode, 0o111) != 0
      _ -> false
    end
  end

  defp json_object(bytes) do
    case decode_json(bytes) do
      {:ok, %{} = doc} -> {:ok, doc}
      {:ok, _} -> {:error, "the output is not a JSON object"}
      :error -> {:error, "the output is not JSON"}
    end
  end

  defp decode_json(bytes) do
    {:ok, :json.decode(bytes)}
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end
end
