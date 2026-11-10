
defmodule JunctureStore do
  # The junctures (D-juncture): points a person keeps of a file's text, as a
  # tree per file -- going back to a point and editing from there starts a
  # branch, the old one stays. A layer over code_editor's own undo (one edit at a
  # time, gone with `:e!`): a point is the whole text, kept until pushed out.
  #
  # A file is put in the index (`set`, its text the point j0 -- the start,
  # `ancestor`, never pushed out, the root of the tree); `point` adds
  # a child of the current point (the file is set first when it is not);
  # `current` moves the current point (back, forward, a point chosen in the
  # juncture_tree panel). The text of a point is never written to the file
  # here: code_editor puts it in as an unsaved edit and the person saves it.
  #
  # Bounds: `files` trees in the index (code.json "juncture.files", 10) --
  # past it the tree touched longest ago goes, never the one being set;
  # `slots` points in a tree ("juncture.slots", 20) -- past it the oldest
  # point goes (never j0, nor the current one), its children hung on its
  # parent: the tree keeps its one root. What
  # goes is answered (`dropped`) so the page can say so.
  #
  # Kept under the work place (`~work/juncture/`, FsHandler.work_root): the
  # texts are files the page reads with /fs/read and compares with `diff`.
  # Thrown away when the relay starts: the junctures belong to a sitting, and
  # tezcatl's stop cannot be counted on to clean up (D-start-outside).
  #
  # One GenServer so the index changes one request at a time.
  use GenServer
  require Logger

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "The junctures directory."
  def dir, do: Path.join(FsHandler.work_root(), "juncture")

  @doc "The same directory as /fs names it."
  def fs_dir, do: FsValidate.work_prefix() <> "/juncture"

  @doc """
  Put `path` in the index with `text` as its start, j0 (nothing when it is
  there already). -> {:ok, %{created, id, dropped: [path]}} | {:error, reason}
  """
  def set(path, text, files), do: GenServer.call(__MODULE__, {:set, path, text, files})

  @doc """
  A new point of `path` with `text`, a child of the current point (the file is
  set first when it is not). The same text as the current point makes none.
  -> {:ok, %{id, same, created, dropped: [path], dropped_points: [id]}} | {:error, reason}
  """
  def point(path, text, files, slots), do: GenServer.call(__MODULE__, {:point, path, text, files, slots})

  @doc "The tree of `path` -> {:ok, tree} | :not_set"
  def tree(path), do: GenServer.call(__MODULE__, {:tree, path})

  @doc """
  Make `id` the current point of `path`; the points above it remember the way
  (`lastChild`, the way `forward` goes). -> :ok | :not_set | :no_point | {:error, reason}
  """
  def current(path, id), do: GenServer.call(__MODULE__, {:current, path, id})

  @doc "The files in the index, touched last first: [%{path, touched, points, current}]"
  def list, do: GenServer.call(__MODULE__, :list)

  # ---- server -------------------------------------------------------------

  @impl true
  def init(:ok) do
    _ = File.rm_rf(dir())
    {:ok, %{trees: %{}}}
  end

  @impl true
  def handle_call({:set, path, text, files}, _from, state) do
    case Map.get(state.trees, path) do
      %{} = t ->
        trees = Map.put(state.trees, path, touch(t))
        reply_indexed({:ok, %{created: false, id: t["current"], dropped: []}}, trees, "set", path, state)

      nil ->
        case add_tree(state.trees, path, text, files) do
          {:ok, trees, dropped} ->
            reply_indexed({:ok, %{created: true, id: "j0", dropped: dropped}}, trees, "set", path, state)

          {:error, why} ->
            failed("set", path, why, state)
        end
    end
  end

  def handle_call({:point, path, text, files, slots}, _from, state) do
    {made, trees, dropped} =
      case Map.get(state.trees, path) do
        nil ->
          case add_tree(state.trees, path, text, files) do
            {:ok, trees, dropped} -> {:created, trees, dropped}
            e -> {e, state.trees, []}
          end

        _ ->
          {:there, state.trees, []}
      end

    case made do
      {:error, why} ->
        failed("point", path, why, state)

      :created ->
        reply_indexed({:ok, %{id: "j0", same: false, created: true, dropped: dropped, dropped_points: []}}, trees, "point", path, state)

      :there ->
        t = trees[path]
        hash = hash(text)

        if t["nodes"][t["current"]]["hash"] == hash do
          trees = Map.put(trees, path, touch(t))
          reply_indexed({:ok, %{id: t["current"], same: true, created: false, dropped: [], dropped_points: []}}, trees, "point", path, state)
        else
          n = t["next"]
          id = "j" <> Integer.to_string(n)
          parent = t["current"]

          case write_text(path, id, text) do
            :ok ->
              node = %{"parent" => parent, "lastChild" => :null, "at" => now(), "hash" => hash}
              nodes = t["nodes"] |> Map.put(id, node) |> Map.update!(parent, &Map.put(&1, "lastChild", id))
              t = %{t | "nodes" => nodes, "current" => id, "next" => n + 1} |> touch()
              {t, out} = evict_points(path, t, slots)
              trees = Map.put(trees, path, t)
              reply_indexed({:ok, %{id: id, same: false, created: false, dropped: [], dropped_points: out}}, trees, "point", path, state)

            {:error, why} ->
              failed("point", path, why, state)
          end
        end
    end
  end

  def handle_call({:tree, path}, _from, state) do
    case Map.get(state.trees, path) do
      nil -> {:reply, :not_set, state}
      t -> {:reply, {:ok, shown(path, t)}, state}
    end
  end

  def handle_call({:current, path, id}, _from, state) do
    case Map.get(state.trees, path) do
      nil ->
        {:reply, :not_set, state}

      %{"nodes" => nodes} = t when is_map_key(nodes, id) ->
        t = %{t | "nodes" => remember_way(nodes, id), "current" => id} |> touch()
        reply_indexed(:ok, Map.put(state.trees, path, t), "current", path, state)

      _ ->
        {:reply, :no_point, state}
    end
  end

  def handle_call(:list, _from, state) do
    rows =
      state.trees
      |> Enum.map(fn {path, t} ->
        %{"path" => path, "touched" => t["touched"], "points" => map_size(t["nodes"]), "current" => t["current"], "seq" => t["seq"]}
      end)
      |> Enum.sort_by(& &1["seq"], :desc)
      |> Enum.map(&Map.delete(&1, "seq"))

    {:reply, rows, state}
  end

  # a new tree with its start, j0; past `files` the trees touched longest ago go
  defp add_tree(trees, path, text, files) do
    case write_text(path, "j0", text) do
      :ok ->
        t = %{
          "current" => "j0",
          "next" => 1,
          "nodes" => %{"j0" => %{"parent" => :null, "lastChild" => :null, "at" => now(), "hash" => hash(text), "ancestor" => true}}
        }
        |> touch()

        trees = Map.put(trees, path, t)

        out =
          if is_integer(files) and files > 0 do
            trees
            |> Enum.reject(fn {p, _} -> p == path end)
            |> Enum.sort_by(fn {_p, t} -> t["seq"] end)
            |> Enum.take(Kernel.max(map_size(trees) - files, 0))
            |> Enum.map(fn {p, _} -> p end)
          else
            []
          end

        Enum.each(out, &File.rm_rf(tree_dir(&1)))
        {:ok, Map.drop(trees, out), out}

      e ->
        e
    end
  end

  # past `slots` points go one by one, the oldest first -- never j0 (the
  # ancestor) nor the current one (just made). Their children hang on their
  # parent, so the tree keeps its one root.
  defp evict_points(path, t, slots) when is_integer(slots) and slots > 0 do
    {nodes, out} = evict_one(path, t["nodes"], t["current"], slots, [])
    {%{t | "nodes" => nodes}, Enum.reverse(out)}
  end

  defp evict_points(_path, t, _slots), do: {t, []}

  defp evict_one(path, nodes, current, slots, out) when map_size(nodes) > slots do
    case nodes
         |> Enum.reject(fn {id, n} -> id == current or n["ancestor"] == true end)
         |> Enum.min_by(fn {id, n} -> {n["at"], num(id)} end, fn -> nil end) do
      nil -> {nodes, out}
      {id, _} -> evict_one(path, unhang(path, nodes, id), current, slots, [id | out])
    end
  end

  defp evict_one(_path, nodes, _current, _slots, out), do: {nodes, out}

  # take `id` out: its children hang on its parent; a parent whose
  # way (lastChild) went through it goes to that child, or to its newest child left
  defp unhang(path, nodes, id) do
    gone = nodes[id]
    up = gone["parent"]
    _ = File.rm(text_file(path, id))

    nodes =
      nodes
      |> Map.delete(id)
      |> Map.new(fn
        {cid, %{"parent" => ^id} = n} -> {cid, %{n | "parent" => up}}
        kv -> kv
      end)

    case nodes[up] do
      %{"lastChild" => ^id} = p ->
        way =
          case gone["lastChild"] do
            c when is_binary(c) -> c
            _ -> newest_child(nodes, up)
          end

        Map.put(nodes, up, %{p | "lastChild" => way})

      _ ->
        nodes
    end
  end

  defp newest_child(nodes, id) do
    nodes
    |> Enum.filter(fn {_c, n} -> n["parent"] == id end)
    |> Enum.max_by(fn {c, n} -> {n["at"], num(c)} end, fn -> {:null, nil} end)
    |> elem(0)
  end

  # every point above `id` remembers the child on the way down to it
  defp remember_way(nodes, id) do
    case nodes[id]["parent"] do
      p when is_binary(p) -> remember_way(Map.update!(nodes, p, &Map.put(&1, "lastChild", id)), p)
      _ -> nodes
    end
  end

  # the tree as the page reads it: each point with the /fs path of its text
  defp shown(path, t) do
    nodes =
      Map.new(t["nodes"], fn {id, n} ->
        {id, %{"parent" => n["parent"], "lastChild" => n["lastChild"], "at" => n["at"], "ancestor" => n["ancestor"] == true,
               "text" => fs_text(path, id)}}
      end)

    %{"path" => path, "current" => t["current"], "touched" => t["touched"], "nodes" => nodes}
  end

  defp reply_indexed(reply, trees, what, path, state) do
    case write_index(trees) do
      :ok -> {:reply, reply, %{state | trees: trees}}
      {:error, why} -> failed(what, path, why, state)
    end
  end

  defp failed(what, path, why, state) do
    Logger.warning("juncture: #{what} #{inspect(path)} failed: #{inspect(why)}")
    {:reply, {:error, why}, state}
  end

  # files/<hash of the path>-<base name>/<id>-<base name>: the extension kept
  # (code_editor colours it when it is opened), one directory per tree
  defp tree_name(path) do
    h = :crypto.hash(:sha256, path) |> Base.encode16(case: :lower) |> binary_part(0, 16)
    h <> "-" <> Path.basename(path)
  end

  defp tree_dir(path), do: Path.join([dir(), "files", tree_name(path)])
  defp text_name(path, id), do: id <> "-" <> Path.basename(path)
  defp text_file(path, id), do: Path.join(tree_dir(path), text_name(path, id))
  defp fs_text(path, id), do: Enum.join([fs_dir(), "files", tree_name(path), text_name(path, id)], "/")

  defp write_text(path, id, text) do
    with :ok <- File.mkdir_p(tree_dir(path)) do
      FsAtomic.write(text_file(path, id), text)
    end
  end

  # the index is for the person who looks (the state lives in this process)
  defp write_index(trees) do
    with :ok <- File.mkdir_p(dir()) do
      FsAtomic.write(Path.join(dir(), "index.json"), IO.iodata_to_binary(:json.encode(%{"trees" => trees})))
    end
  end

  defp hash(text), do: "sha256:" <> (:crypto.hash(:sha256, text) |> Base.encode16(case: :lower))
  defp num("j" <> n), do: String.to_integer(n)
  defp now, do: System.os_time(:millisecond)

  # touched now; `seq` orders trees touched in the same millisecond
  defp touch(t), do: Map.merge(t, %{"touched" => now(), "seq" => System.unique_integer([:monotonic, :positive])})
end

defmodule JunctureHandler do
  # /juncture: the routes of JunctureStore. `path` is a path from the FS root
  # (checked like /fs/*); the work place is not a file to keep junctures of.
  #
  #   POST /juncture/set?path=&files=N             body: the text (the start, j0)
  #        -> {"ok":true,"created":bool,"id":"j0","dropped":[path]}
  #   POST /juncture/point?path=&files=N&slots=M   body: the text
  #        -> {"ok":true,"id","same":bool,"created":bool,"dropped":[path],"dropped_points":[id]}
  #   POST /juncture/current?path=&to=id  -> {"ok":true} | 404 {"code":"not_set" | "no_point"}
  #   GET  /juncture/tree?path=   -> {path, current, touched, nodes: {id: {parent, lastChild, at, ancestor, text}}}
  #        (text: the /fs path of the point's text, ~work/juncture/...) | 404 {"code":"not_set"}
  #   GET  /juncture/list         -> {"files":[{path, touched, points, current}]}
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
            "access-control-allow-methods" => "GET, POST, OPTIONS",
            "access-control-allow-headers" => "content-type", "access-control-max-age" => "600"}
      end

    :cowboy_req.reply(204, headers, "", req)
  end

  defp handle("GET", "/juncture/list", _q, origin, req) do
    json(200, %{"files" => JunctureStore.list()}, origin, req)
  end

  defp handle("GET", "/juncture/tree", q, origin, req) do
    with_path(q, origin, req, fn rel ->
      case JunctureStore.tree(rel) do
        {:ok, t} -> json(200, t, origin, req)
        :not_set -> not_set(origin, req)
      end
    end)
  end

  defp handle("POST", route, q, origin, req) when route in ["/juncture/set", "/juncture/point"] do
    gate(origin, req, fn ->
      with_path(q, origin, req, fn rel ->
        files = count(q.("files"), 10)
        slots = count(q.("slots"), 20)

        case read_body(req, @max_write, "") do
          {:error, :too_large} ->
            json(413, %{"error" => "body too large"}, origin, req)

          {:ok, text, req} ->
            r =
              if route == "/juncture/set",
                do: JunctureStore.set(rel, text, files),
                else: JunctureStore.point(rel, text, files, slots)

            case r do
              {:ok, m} -> json(200, Map.put(m, :ok, true), origin, req)
              {:error, why} -> not_written(why, origin, req)
            end
        end
      end)
    end)
  end

  defp handle("POST", "/juncture/current", q, origin, req) do
    gate(origin, req, fn ->
      with_path(q, origin, req, fn rel ->
        case JunctureStore.current(rel, q.("to")) do
          :ok -> json(200, %{"ok" => true}, origin, req)
          :not_set -> not_set(origin, req)
          :no_point -> json(404, %{"error" => "no such point", "code" => "no_point"}, origin, req)
          {:error, why} -> not_written(why, origin, req)
        end
      end)
    end)
  end

  defp handle(_m, _route, _q, origin, req) do
    json(405, %{"error" => "method not allowed"}, origin, req)
  end

  defp count(s, default) do
    case Integer.parse(s) do
      {n, ""} when n > 0 and n <= 100 -> n
      _ -> default
    end
  end

  # the path from the FS root, normalised (as /mirror reads it)
  defp with_path(q, origin, req, fun) do
    root = System.get_env("TEZCATL_FS_ROOT") || File.cwd!()
    p = String.replace(q.("path"), ~r{^/+}, "")

    if String.starts_with?(p, FsValidate.work_prefix()) do
      json(400, %{"error" => "a file of the work place has no junctures"}, origin, req)
    else
      case FsValidate.resolve(root, p) do
        {:ok, abs} ->
          rel = Path.relative_to(abs, Path.expand(root))
          if rel in ["", "."] or rel == Path.expand(root),
            do: json(400, %{"error" => "path= names no file"}, origin, req),
            else: fun.(rel)

        {:error, reason} ->
          json(400, %{"error" => reason}, origin, req)
      end
    end
  end

  defp gate(origin, req, fun) do
    case AllowedOrigins.check(origin) do
      :ok -> fun.()
      {:error, o} ->
        Logger.info("juncture: rejecting a change, disallowed Origin #{inspect(o)}")
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

  defp not_set(origin, req), do: json(404, %{"error" => "this file is not set (juncture set)", "code" => "not_set"}, origin, req)

  defp not_written(why, origin, req) do
    json(500, %{"error" => "the point could not be written (#{inspect(why)})", "code" => "not_written"}, origin, req)
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
