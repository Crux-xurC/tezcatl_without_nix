defmodule ProjectEnv do
  # The projects' environments, asked once per project and kept until
  # `env reload` (D-project-env). One GenServer: a project's command runs once
  # even when several language servers and terminals want it at the same time;
  # the others wait for the same answer.
  #
  # A result:
  #   %{root, marker, command, format, ok: bool, reason (nil when ok),
  #     change: %{set, unset, path} (ProjectEnvConfig.decode/3; nothing when not ok)}
  # A failure is kept too (the command is slow; `env reload` asks again).

  use GenServer
  require Logger

  @max_output 16 * 1024 * 1024

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc """
  The environment of `root` by `entry` for `pid`: `{:ok, result}` when kept,
  else `:pending` and `{:project_env, {root, marker}, result}` is sent to
  `pid` once the command has answered (or ran out of `timeout_ms`).
  """
  def request(root, entry, timeout_ms, pid \\ self()),
    do: GenServer.call(__MODULE__, {:request, root, entry, timeout_ms, pid})

  @doc "The same, waiting for it (an HTTP handler): `result` or `{:error, :timeout}`."
  def await(root, entry, timeout_ms) do
    key = {root, entry.marker}

    case request(root, entry, timeout_ms) do
      {:ok, r} ->
        r

      :pending ->
        receive do
          {:project_env, ^key, r} -> r
        after
          timeout_ms + 5_000 -> {:error, :timeout}
        end
    end
  end

  @doc """
  Where the project around `dir` (absolute) is, by project_env.json in the
  relay's directory: `{:ok, %{root, entry, timeout_ms}}`, `:none`, or
  `{:error, reason}` (the file is broken).
  """
  def where(dir) do
    fs_root = System.get_env("TEZCATL_FS_ROOT") || File.cwd!()

    with {:ok, cfg} <- ProjectEnvConfig.read(File.cwd!()) do
      case ProjectEnvConfig.locate(dir, cfg.entries, fs_root) do
        {:ok, root, entry} -> {:ok, %{root: root, entry: entry, timeout_ms: cfg.timeout_ms}}
        :none -> :none
      end
    end
  end

  @doc "A result for the browser (the env frames of /lsp and /pty, GET /env)."
  def describe(%{} = r) do
    base_path = System.get_env("PATH")

    names =
      if r.ok,
        do: r.change.set |> Map.keys() |> Enum.reject(&(&1 == "PATH")) |> Enum.sort(),
        else: []

    %{
      "root" => r.root,
      "marker" => r.marker,
      "command" => r.command,
      "ok" => r.ok,
      "reason" => r.reason || :null,
      "pathAdded" => if(r.ok, do: ProjectEnvConfig.path_added(r.change.path, base_path), else: []),
      "set" => names,
      "unset" => if(r.ok, do: r.change.unset, else: [])
    }
  end

  @doc "What a process is started with under a result (nil: the relay's own): {env list, PATH}."
  def exec_of(%{ok: true, change: change}), do: {ProjectEnvConfig.exec_env(change), change.path}
  def exec_of(_), do: {[], System.get_env("PATH")}

  @doc "Whether `root` by `entry` is kept now (no command is run)."
  def kept?(root, entry), do: GenServer.call(__MODULE__, {:kept, {root, entry.marker}})

  @doc "Throw away what is kept: of the roots in `roots`, or all (`:all`). The roots thrown away."
  def forget(roots), do: GenServer.call(__MODULE__, {:forget, roots})

  # ---- server ------------------------------------------------------

  @impl true
  def init(:ok), do: {:ok, %{kept: %{}, waiting: %{}}}

  @impl true
  def handle_call({:request, root, entry, timeout_ms, pid}, _from, state) do
    key = {root, entry.marker}

    cond do
      Map.has_key?(state.kept, key) ->
        {:reply, {:ok, state.kept[key]}, state}

      Map.has_key?(state.waiting, key) ->
        {:reply, :pending, update_in(state.waiting[key], &[pid | &1])}

      true ->
        me = self()
        base = System.get_env()
        Task.start(fn -> send(me, {:fetched, key, fetch(root, entry, base, timeout_ms)}) end)
        {:reply, :pending, put_in(state.waiting[key], [pid])}
    end
  end

  def handle_call({:kept, key}, _from, state), do: {:reply, Map.has_key?(state.kept, key), state}

  def handle_call({:forget, :all}, _from, state) do
    roots = state.kept |> Map.keys() |> Enum.map(&elem(&1, 0)) |> Enum.uniq()
    {:reply, roots, %{state | kept: %{}}}
  end

  def handle_call({:forget, roots}, _from, state) when is_list(roots) do
    {gone, kept} = Enum.split_with(state.kept, fn {{root, _}, _} -> root in roots end)
    {:reply, gone |> Enum.map(fn {{root, _}, _} -> root end) |> Enum.uniq(), %{state | kept: Map.new(kept)}}
  end

  @impl true
  def handle_info({:fetched, key, result}, state) do
    {pids, waiting} = Map.pop(state.waiting, key, [])
    Enum.each(pids, &send(&1, {:project_env, key, result}))
    {:noreply, %{state | kept: Map.put(state.kept, key, result), waiting: waiting}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  # ---- running the entry's command ----------------------------------

  @doc false
  def fetch(root, entry, base, timeout_ms) do
    head = %{root: root, marker: entry.marker, command: entry.command, format: entry.format}
    t0 = System.monotonic_time(:millisecond)

    answer =
      with {:ok, argv} <- argv_of(entry.command, Map.get(base, "PATH")),
           {:ok, out} <- run(argv, root, timeout_ms) do
        ProjectEnvConfig.decode(entry.format, out, base)
      end

    ms = System.monotonic_time(:millisecond) - t0

    case answer do
      {:ok, change} ->
        Logger.info("project env: #{root} by #{entry.marker} (#{ms} ms)")
        Map.merge(head, %{ok: true, reason: nil, change: change})

      {:error, why} ->
        Logger.warning("project env: #{root} by #{entry.marker} failed: #{why}")
        Map.merge(head, %{ok: false, reason: why, change: nil})
    end
  end

  defp argv_of([exe | args], path) do
    case ProjectEnvConfig.find_executable(exe, path) do
      nil -> {:error, "#{exe} is not on the relay's PATH"}
      full -> {:ok, [String.to_charlist(full) | Enum.map(args, &String.to_charlist/1)]}
    end
  end

  defp run(argv, root, timeout_ms) do
    with {:ok, _} <- Application.ensure_all_started(:erlexec),
         {:ok, _pid, ospid} <-
           :exec.run(argv, [:stdout, :stderr, :monitor, {:cd, String.to_charlist(root)}, {:group, 0}, :kill_group]) do
      collect(ospid, [], [], 0, System.monotonic_time(:millisecond) + timeout_ms, timeout_ms)
    else
      {:error, why} -> {:error, "could not run the command: #{inspect(why)}"}
    end
  end

  defp collect(ospid, out, err, size, deadline, timeout_ms) do
    left = max(deadline - System.monotonic_time(:millisecond), 0)

    receive do
      {:stdout, ^ospid, data} ->
        if size + byte_size(data) > @max_output do
          :exec.stop(ospid)
          {:error, "the output is over #{div(@max_output, 1024 * 1024)} MB"}
        else
          collect(ospid, [out, data], err, size + byte_size(data), deadline, timeout_ms)
        end

      {:stderr, ^ospid, data} ->
        collect(ospid, out, [err, data], size, deadline, timeout_ms)

      {:DOWN, ^ospid, :process, _pid, :normal} ->
        {:ok, IO.iodata_to_binary(out)}

      {:DOWN, ^ospid, :process, _pid, reason} ->
        {:error, "the command ended with #{ended(reason)}" <> tail(err)}
    after
      left ->
        :exec.stop(ospid)
        {:error, "no answer in #{div(timeout_ms, 1000)} s (timeoutMs of project_env.json)"}
    end
  end

  defp ended({:exit_status, st}) when is_integer(st) do
    case :exec.status(st) do
      {:status, code} -> "exit code #{code}"
      {:signal, sig, _core} -> "signal #{sig}"
    end
  end

  defp ended(reason), do: inspect(reason)

  # the last line of what the command said on stderr
  defp tail(err) do
    case err |> IO.iodata_to_binary() |> String.split("\n", trim: true) |> List.last() do
      nil -> ""
      line -> ": " <> String.slice(line, 0, 300)
    end
  end
end
