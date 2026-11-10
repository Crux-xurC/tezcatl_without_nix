
defmodule MirrorStore do
  # The copies of what code_editor is editing:
  # an insurance, not something to rely on. One *slot* per file a code_editor has
  # open -- entered when it opens the file, removed when that code_editor is
  # closed, and the oldest pushed out past `slots` (the client's code.json
  # "mirror.slots", default 10). A slot holds the latest text only.
  # A code_editor closed with unsaved edits does not remove its slot: the slot is
  # marked `unsaved_closed` (when) and kept, so the edit can be replayed and
  # the file_changes panel can say so .
  # The mark goes when a code_editor opens the file again (the slot is its now).
  # A marked slot is never pushed out (the file_changes
  # panel said the copy is there) -- it goes when the file is opened again
  # or the person drops it. The close may carry the text as it was at
  # closing: the slot is written with it, made again if it had been pushed
  # out while the code_editor was open.
  #
  # Kept in the user's state directory -- `$XDG_STATE_HOME/tezcatl/mirror`,
  # `~/.local/state/tezcatl/mirror` without it; TEZCATL_MIRROR_DIR overrides
  # it. Not under tezcatl's directory (`example_mirror/` before):
  # the pages server (`:4001`, python's http.server) gives out that directory
  # whole, without looking at `Host`, so a copy of any file being edited was
  # readable to a rebound page; nor under the FS root. Outside every project:
  # a copy that keeps its extension is never picked up by a build tool, a
  # language server or Xipe Totec's scan. The files are flat under `files/`,
  # named `<hash of the path>-<its base name>` (the slot's "file"): copies of
  # `foo` and of `foo/bar.ex` never get in each other's way, as they did when
  # a copy's path was its file's (a slot from then, with no "file", is still
  # read where it is). The slots are in `index.json` -- read back when the
  # relay starts, so what a crash left is still there to replay.
  #
  # A copy that cannot be written (a full disk, permissions) is an answer,
  # {:error, reason}, never a crash: a crash of this GenServer counted against
  # the relay's supervisor, and a few in a row stopped the whole relay (the
  # terminals' shells with it).
  #
  # One GenServer so the slots and their order change one request at a time
  # (cowboy runs each request in its own process).
  use GenServer
  require Logger

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "The mirror directory."
  def dir do
    case System.get_env("TEZCATL_MIRROR_DIR") do
      d when is_binary(d) and d != "" -> Path.expand(d)
      _ -> Path.join([state_home(), "tezcatl", "mirror"])
    end
  end

  # XDG: an absolute $XDG_STATE_HOME, else ~/.local/state
  defp state_home do
    case System.get_env("XDG_STATE_HOME") do
      "/" <> _ = d -> d
      _ -> Path.expand("~/.local/state")
    end
  end

  @doc """
  Put `text` in the slot of `path` (a path from the FS root, already checked)
  for `owner`. `mode` "open": a code_editor has just opened the file -- a slot
  left with another text (a crash, an unsent close) is kept, and said
  (`left`), so it can be replayed; "write": the text is the slot's.
  -> {:ok, %{left: nil | %{updated, bytes}, evicted: [path]}} | {:error, reason}
  """
  def put(path, owner, text, mode, slots), do: GenServer.call(__MODULE__, {:put, path, owner, text, mode, slots})

  @doc "-> {:ok, text} | :none"
  def get(path), do: GenServer.call(__MODULE__, {:get, path})

  @doc "The slots, the newest first: [%{path, owner, opened, updated, bytes, unsaved_closed}]"
  def list, do: GenServer.call(__MODULE__, :list)

  @doc """
  Remove the slot of `path` if `owner` holds it (a code_editor closed). With
  `unsaved` true (closed with unsaved edits) the slot stays, marked
  `unsaved_closed`; `text` (the text at closing, or nil) is written to it --
  and makes the slot again when it is gone (pushed out while the code_editor
  was open). -> :ok | :kept | :not_owner | :none | {:error, reason}
  """
  def close(path, owner, unsaved \\ false, text \\ nil, slots \\ nil),
    do: GenServer.call(__MODULE__, {:close, path, owner, unsaved, text, slots})

  @doc """
  Throw away the copy of `path` left by a code_editor closed with unsaved edits
  (the slot marked `unsaved_closed`) -- the person, told, decided it is not
  wanted. A slot a code_editor holds now is not
  touched. -> :ok | :in_use | :none
  """
  def drop_left(path), do: GenServer.call(__MODULE__, {:drop_left, path})

  # ---- server -------------------------------------------------------------

  @impl true
  def init(:ok), do: {:ok, %{slots: read_index() |> Map.new(&named/1)}}

  # a slot from before "file" (its copy at files/<path>): moved to its flat name
  defp named({path, %{"file" => f} = slot}) when is_binary(f), do: {path, slot}

  defp named({path, slot}) do
    slot = Map.put(slot, "file", file_name(path))
    _ = File.rename(file_of(path, nil), file_of(path, slot))
    {path, slot}
  end

  @impl true
  def handle_call({:put, path, owner, text, mode, max}, _from, state) do
    now = System.os_time(:millisecond)
    prev = Map.get(state.slots, path)
    left =
      if mode == "open" and prev != nil do
        case File.read(file_of(path, prev)) do
          {:ok, old} when old != text -> %{"updated" => prev["updated"], "bytes" => byte_size(old)}
          _ -> nil
        end
      end

    slot = %{
      "owner" => owner,
      "file" => (prev && prev["file"]) || file_name(path),
      "opened" => if(prev && mode != "open", do: prev["opened"], else: now),
      "updated" => if(left, do: prev["updated"], else: now)
    }

    with :ok <- if(left, do: :ok, else: write_file(slot, text)),
         slots = Map.put(state.slots, path, slot),
         {slots, evicted} = evict(slots, path, max),
         :ok <- write_index(slots) do
      {:reply, {:ok, %{left: left, evicted: evicted}}, %{state | slots: slots}}
    else
      {:error, why} -> failed("put", path, why, state)
    end
  end

  def handle_call({:get, path}, _from, state) do
    reply =
      with %{} = slot <- Map.get(state.slots, path),
           {:ok, text} <- File.read(file_of(path, slot)) do
        {:ok, text}
      else
        _ -> :none
      end

    {:reply, reply, state}
  end

  def handle_call(:list, _from, state) do
    rows =
      state.slots
      |> Enum.map(fn {path, s} ->
        bytes = case File.stat(file_of(path, s)) do
          {:ok, %File.Stat{size: n}} -> n
          _ -> 0
        end
        %{"path" => path, "owner" => s["owner"], "opened" => s["opened"], "updated" => s["updated"], "bytes" => bytes,
          "unsaved_closed" => s["unsaved_closed"] || :null}
      end)
      |> Enum.sort_by(& &1["opened"], :desc)

    {:reply, rows, state}
  end

  def handle_call({:close, path, owner, unsaved, text, max}, _from, state) do
    now = System.os_time(:millisecond)

    case Map.get(state.slots, path) do
      # pushed out while its code_editor was open: the text at closing makes it again
      nil when unsaved and is_binary(text) ->
        slot = %{"owner" => owner, "file" => file_name(path), "opened" => now, "updated" => now, "unsaved_closed" => now}

        with :ok <- write_file(slot, text),
             {slots, _evicted} = evict(Map.put(state.slots, path, slot), path, max),
             :ok <- write_index(slots) do
          {:reply, :kept, %{state | slots: slots}}
        else
          {:error, why} -> failed("close", path, why, state)
        end

      nil ->
        {:reply, :none, state}

      %{"owner" => ^owner} = slot when unsaved ->
        with :ok <- if(is_binary(text), do: write_file(slot, text), else: :ok),
             slot = if(is_binary(text), do: Map.put(slot, "updated", now), else: slot),
             slots = Map.put(state.slots, path, Map.put(slot, "unsaved_closed", now)),
             :ok <- write_index(slots) do
          {:reply, :kept, %{state | slots: slots}}
        else
          {:error, why} -> failed("close", path, why, state)
        end

      %{"owner" => ^owner} ->
        slots = drop(state.slots, path)
        reply_indexed(:ok, slots, "close", path, state)

      _ ->
        {:reply, :not_owner, state}
    end
  end

  def handle_call({:drop_left, path}, _from, state) do
    case Map.get(state.slots, path) do
      nil ->
        {:reply, :none, state}

      %{"unsaved_closed" => at} when is_integer(at) ->
        slots = drop(state.slots, path)
        reply_indexed(:ok, slots, "drop", path, state)

      _ ->
        {:reply, :in_use, state}
    end
  end

  # the oldest opened go past `max` (never the one just put). A copy left by
  # a code_editor closed unsaved is neither pushed out nor counted:
  # `max` bounds the slots of the files being edited
  defp evict(slots, keep, max) when is_integer(max) and max > 0 do
    open = Enum.reject(slots, fn {_p, s} -> is_integer(s["unsaved_closed"]) end)

    out =
      open
      |> Enum.reject(fn {p, _} -> p == keep end)
      |> Enum.sort_by(fn {_p, s} -> s["opened"] end)
      |> Enum.take(Kernel.max(length(open) - max, 0))
      |> Enum.map(fn {p, _} -> p end)

    {Enum.reduce(out, slots, &drop(&2, &1)), out}
  end

  defp evict(slots, _keep, _max), do: {slots, []}

  defp drop(slots, path) do
    _ = File.rm(file_of(path, Map.get(slots, path)))
    Map.delete(slots, path)
  end

  # the slots dropped are gone from the disk already: the index follows, or the
  # change is not kept (the next write of the index has it)
  defp reply_indexed(reply, slots, what, path, state) do
    case write_index(slots) do
      :ok -> {:reply, reply, %{state | slots: slots}}
      {:error, why} -> failed(what, path, why, state)
    end
  end

  defp failed(what, path, why, state) do
    Logger.warning("mirror: #{what} #{inspect(path)} failed: #{inspect(why)}")
    {:reply, {:error, why}, state}
  end

  # the copy's file: flat under files/, the slot's "file" (without one: the
  # path itself, where a copy was put before -- named/1 moves it)
  defp file_of(_path, %{"file" => f}) when is_binary(f), do: Path.join([dir(), "files", f])
  defp file_of(path, _slot), do: Path.join([dir(), "files", path])

  # "<hash of the path>-<base name>": one name per path, the extension kept
  defp file_name(path) do
    hash = :crypto.hash(:sha256, path) |> Base.encode16(case: :lower) |> binary_part(0, 16)
    hash <> "-" <> Path.basename(path)
  end

  defp write_file(slot, text) do
    f = Path.join([dir(), "files", slot["file"]])

    with :ok <- File.mkdir_p(Path.dirname(f)) do
      FsAtomic.write(f, text)
    end
  end

  defp index_file, do: Path.join(dir(), "index.json")

  defp read_index do
    with {:ok, bytes} <- File.read(index_file()),
         %{"slots" => slots} when is_map(slots) <- (try do :json.decode(bytes) rescue _ -> nil end) do
      slots
    else
      _ -> %{}
    end
  end

  # written whole to a temp file and renamed: a crash never leaves half an index
  defp write_index(slots) do
    with :ok <- File.mkdir_p(dir()) do
      FsAtomic.write(index_file(), IO.iodata_to_binary(:json.encode(%{"slots" => slots})))
    end
  end
end

defmodule MirrorHandler do
  # /mirror: the routes of MirrorStore. `path` is a path from the FS
  # root (checked like /fs/*, though the copy lives in the mirror directory);
  # `owner` names the code_editor that holds the slot.
  #
  #   PUT  /mirror?path=&owner=&mode=open|write&slots=N   body: the text
  #        -> {"ok":true,"left":null|{"updated","bytes"},"evicted":[...]}
  #   GET  /mirror?path=        -> the text (404 when there is no slot)
  #   GET  /mirror/list         -> {"slots":[{path, owner, opened, updated, bytes, unsaved_closed}]}
  #   POST /mirror/drop?path=  throw away a copy left by a code_editor closed unsaved
  #        -> {"ok":true,"result":"ok"} | 409 {"code":"in_use"} (a code_editor holds it) | 404 {"code":"none"}
  #   POST /mirror/close?path=&owner=[&unsaved=1[&text=1&slots=N]]   (navigator.sendBeacon when code_editor closes;
  #        unsaved=1: it had unsaved edits -- the slot is kept, marked, "result":"kept";
  #        text=1: the body is the text at closing, written to the slot -- made again if it was pushed out)
  #
  # Writes are Origin-strict like /fs/write; reads answer CORS to an allowed
  # Origin only (AllowedOrigins).
  require Logger

  @max_write 5 * 1024 * 1024

  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)
    qs = :cowboy_req.parse_qs(req0)
    q = fn k -> case :proplists.get_value(k, qs, "") do v when is_binary(v) -> v; _ -> "" end end
    req = handle(:cowboy_req.method(req0), :cowboy_req.path(req0), q, origin, req0)
    {:ok, req, state}
  end

  defp handle("OPTIONS", _route, _q, origin, req) do
    headers =
      case AllowedOrigins.acao(origin) do
        nil -> %{"vary" => "origin"}
        allowed ->
          %{"vary" => "origin", "access-control-allow-origin" => allowed,
            "access-control-allow-methods" => "GET, PUT, POST, OPTIONS",
            "access-control-allow-headers" => "content-type", "access-control-max-age" => "600"}
      end

    :cowboy_req.reply(204, headers, "", req)
  end

  defp handle("GET", "/mirror/list", _q, origin, req) do
    json(200, %{"slots" => MirrorStore.list()}, origin, req)
  end

  defp handle("GET", "/mirror", q, origin, req) do
    with_path(q, origin, req, fn rel ->
      case MirrorStore.get(rel) do
        {:ok, text} ->
          :cowboy_req.reply(200, cors(%{"content-type" => "text/plain; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}, origin), text, req)

        :none ->
          json(404, %{"error" => "no copy of this file", "code" => "none"}, origin, req)
      end
    end)
  end

  defp handle("PUT", "/mirror", q, origin, req) do
    gate(origin, req, fn ->
      with_path(q, origin, req, fn rel ->
        owner = q.("owner")
        mode = if q.("mode") == "open", do: "open", else: "write"
        slots = case Integer.parse(q.("slots")) do {n, ""} when n > 0 -> n; _ -> 10 end

        cond do
          owner == "" ->
            json(400, %{"error" => "owner= is needed"}, origin, req)

          true ->
            case read_body(req, @max_write, "") do
              {:error, :too_large} ->
                json(413, %{"error" => "body too large"}, origin, req)

              {:ok, text, req} ->
                case MirrorStore.put(rel, owner, text, mode, slots) do
                  {:ok, r} -> json(200, %{"ok" => true, "left" => r.left || :null, "evicted" => r.evicted}, origin, req)
                  {:error, why} -> not_written(why, origin, req)
                end
            end
        end
      end)
    end)
  end

  defp handle("POST", "/mirror/close", q, origin, req) do
    gate(origin, req, fn ->
      with_path(q, origin, req, fn rel ->
        unsaved = q.("unsaved") == "1"
        slots = case Integer.parse(q.("slots")) do {n, ""} when n > 0 -> n; _ -> 10 end

        body =
          if unsaved and q.("text") == "1",
            do: read_body(req, @max_write, ""),
            else: {:ok, nil, req}

        case body do
          {:error, :too_large} ->
            json(413, %{"error" => "body too large"}, origin, req)

          {:ok, text, req} ->
            case MirrorStore.close(rel, q.("owner"), unsaved, text, slots) do
              {:error, why} -> not_written(why, origin, req)
              r -> json(200, %{"ok" => r in [:ok, :kept], "result" => Atom.to_string(r)}, origin, req)
            end
        end
      end)
    end)
  end

  defp handle("POST", "/mirror/drop", q, origin, req) do
    gate(origin, req, fn ->
      with_path(q, origin, req, fn rel ->
        case MirrorStore.drop_left(rel) do
          :ok -> json(200, %{"ok" => true, "result" => "ok"}, origin, req)
          :in_use -> json(409, %{"error" => "a code_editor has this file open; its copy is its own", "code" => "in_use"}, origin, req)
          :none -> json(404, %{"error" => "no copy of this file", "code" => "none"}, origin, req)
          {:error, why} -> not_written(why, origin, req)
        end
      end)
    end)
  end

  defp handle(_m, _route, _q, origin, req) do
    json(405, %{"error" => "method not allowed"}, origin, req)
  end

  # the path from the FS root, normalised (no "..", no leading "/") -- the
  # name of the slot and of its file under files/
  defp with_path(q, origin, req, fun) do
    root = System.get_env("TEZCATL_FS_ROOT") || File.cwd!()

    # a leading "/" is the FS root, as lib/code/code-locate.js reads it
    case FsValidate.resolve(root, String.replace(q.("path"), ~r{^/+}, "")) do
      {:ok, abs} ->
        rel = Path.relative_to(abs, Path.expand(root))
        if rel in ["", "."] or rel == Path.expand(root),
          do: json(400, %{"error" => "path= names no file"}, origin, req),
          else: fun.(rel)

      {:error, reason} ->
        json(400, %{"error" => reason}, origin, req)
    end
  end

  defp gate(origin, req, fun) do
    case AllowedOrigins.check(origin) do
      :ok -> fun.()
      {:error, o} ->
        Logger.info("mirror: rejecting a change, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
    end
  end

  defp read_body(req, cap, acc) do
    case :cowboy_req.read_body(req, %{length: 1_000_000, period: 5_000}) do
      {:ok, chunk, req} ->
        acc = acc <> chunk
        if byte_size(acc) > cap, do: {:error, :too_large}, else: {:ok, acc, req}

      {:more, chunk, req} ->
        acc = acc <> chunk
        if byte_size(acc) > cap, do: {:error, :too_large}, else: read_body(req, cap, acc)
    end
  end

  defp not_written(why, origin, req) do
    json(500, %{"error" => "the copy could not be written (#{inspect(why)})", "code" => "not_written"}, origin, req)
  end

  defp json(status, map, origin, req) do
    :cowboy_req.reply(status,
      cors(%{"content-type" => "application/json; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}, origin),
      IO.iodata_to_binary(:json.encode(map)), req)
  end

  defp cors(headers, origin) do
    case AllowedOrigins.acao(origin) do
      nil -> headers
      allowed -> Map.put(headers, "access-control-allow-origin", allowed)
    end
  end
end
