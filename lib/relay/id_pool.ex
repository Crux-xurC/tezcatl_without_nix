
defmodule IdPool do
  # The id lists (D-id-pool): ids a note's `#eigenvalue` marks are
  # replaced with (code_editor's `:Replace <mark> <list>`, `:w replace ...`). A
  # list is a file `<name>.json` in the user's state directory:
  #   {"available": [id, ...], "issued": {id: {"at": ms, "path": path}}}
  # `take` hands out the first n of `available`, moves them to `issued` (with
  # the file they went into) and fills `available` up again with new ids --
  # never one in `issued` or `available`, so an id is never handed out twice
  # (ids are not used again: a row of a note keeps its id as its key). An id
  # is 8 characters of [0-9a-z]. A list is made the first time it is named.
  #
  # Kept in `$XDG_STATE_HOME/tezcatl/ids` (`~/.local/state/tezcatl/ids`
  # without it; TEZCATL_IDS_DIR overrides it): outside every project and the
  # pages server's directory. Only the relay writes it.
  #
  # One GenServer so two code_editor saving at once never get the same id.
  use GenServer
  require Logger

  @alphabet ~c"0123456789abcdefghijklmnopqrstuvwxyz"
  @len 8

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "The ids directory."
  def dir do
    case System.get_env("TEZCATL_IDS_DIR") do
      d when is_binary(d) and d != "" ->
        Path.expand(d)

      _ ->
        home =
          case System.get_env("XDG_STATE_HOME") do
            "/" <> _ = d -> d
            _ -> Path.expand("~/.local/state")
          end

        Path.join([home, "tezcatl", "ids"])
    end
  end

  @doc "a list's name: [a-z0-9_-], 1-64 characters"
  def valid_name?(name), do: is_binary(name) and Regex.match?(~r/\A[a-z0-9_-]{1,64}\z/, name)

  @doc """
  The first `n` ids of `list` for `path`, `available` filled up to `keep`
  again. -> {:ok, [id]} | {:error, reason}
  """
  def take(list, n, path, keep), do: GenServer.call(__MODULE__, {:take, list, n, path, keep})

  # ---- server -------------------------------------------------------------

  @impl true
  def init(:ok), do: {:ok, %{}}

  @impl true
  def handle_call({:take, list, n, path, keep}, _from, state) do
    with {:ok, doc} <- read(list) do
      doc = fill(doc, Kernel.max(keep, n))
      {ids, rest} = Enum.split(doc["available"], n)
      at = System.os_time(:millisecond)
      issued = Enum.reduce(ids, doc["issued"], fn id, acc -> Map.put(acc, id, %{"at" => at, "path" => path}) end)
      doc = fill(%{doc | "available" => rest, "issued" => issued}, keep)

      case write(list, doc) do
        :ok -> {:reply, {:ok, ids}, state}
        {:error, why} -> failed(list, why, state)
      end
    else
      {:error, why} -> failed(list, why, state)
    end
  end

  defp failed(list, why, state) do
    Logger.warning("ids: #{list} failed: #{inspect(why)}")
    {:reply, {:error, why}, state}
  end

  # available filled up to `keep` with ids that are nowhere in the list
  defp fill(doc, keep) do
    have = MapSet.new(doc["available"]) |> MapSet.union(MapSet.new(Map.keys(doc["issued"])))
    {more, _} =
      Enum.reduce_while(Stream.repeatedly(&new_id/0), {[], have}, fn id, {acc, seen} ->
        cond do
          length(doc["available"]) + length(acc) >= keep -> {:halt, {acc, seen}}
          MapSet.member?(seen, id) -> {:cont, {acc, seen}}
          true -> {:cont, {[id | acc], MapSet.put(seen, id)}}
        end
      end)

    %{doc | "available" => doc["available"] ++ Enum.reverse(more)}
  end

  defp new_id do
    for _ <- 1..@len, into: "", do: <<Enum.at(@alphabet, :rand.uniform(length(@alphabet)) - 1)>>
  end

  defp file(list), do: Path.join(dir(), list <> ".json")

  # a list not there yet is empty; one that cannot be read is an error (never written over)
  defp read(list) do
    case File.read(file(list)) do
      {:ok, bytes} ->
        case (try do :json.decode(bytes) rescue _ -> nil end) do
          %{"available" => a, "issued" => i} when is_list(a) and is_map(i) -> {:ok, %{"available" => a, "issued" => i}}
          _ -> {:error, :unreadable}
        end

      {:error, :enoent} ->
        {:ok, %{"available" => [], "issued" => %{}}}

      {:error, why} ->
        {:error, why}
    end
  end

  defp write(list, doc) do
    with :ok <- File.mkdir_p(dir()) do
      FsAtomic.write(file(list), IO.iodata_to_binary(:json.encode(doc)))
    end
  end
end

defmodule IdPoolHandler do
  # /ids: the routes of IdPool.
  #
  #   POST /ids/take?list=<name>&n=<1-1000>&path=<file>[&keep=<1-10000>]
  #        -> {"ok":true,"ids":[...]} | 400 (a bad name or n) | 500 {"code":"not_written"}
  #
  # Origin-strict like /fs/write (it writes the list).
  require Logger

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
            "access-control-allow-methods" => "POST, OPTIONS",
            "access-control-allow-headers" => "content-type", "access-control-max-age" => "600"}
      end

    :cowboy_req.reply(204, headers, "", req)
  end

  defp handle("POST", "/ids/take", q, origin, req) do
    case AllowedOrigins.check(origin) do
      {:error, o} ->
        Logger.info("ids: rejecting a take, disallowed Origin #{inspect(o)}")
        :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)

      :ok ->
        list = q.("list")
        n = count(q.("n"), 1000)
        keep = count(q.("keep"), 10_000) || 100

        cond do
          not IdPool.valid_name?(list) -> json(400, %{"error" => "list= is a name of [a-z0-9_-]"}, origin, req)
          n == nil -> json(400, %{"error" => "n= is 1 to 1000"}, origin, req)
          true ->
            case IdPool.take(list, n, q.("path"), keep) do
              {:ok, ids} -> json(200, %{"ok" => true, "ids" => ids}, origin, req)
              {:error, why} -> json(500, %{"error" => "the list #{list} could not be used (#{inspect(why)})", "code" => "not_written"}, origin, req)
            end
        end
    end
  end

  defp handle(_m, _route, _q, origin, req), do: json(405, %{"error" => "method not allowed"}, origin, req)

  defp count(s, max) do
    case Integer.parse(s) do
      {n, ""} when n >= 1 and n <= max -> n
      _ -> nil
    end
  end

  defp json(status, map, origin, req) do
    headers = %{"content-type" => "application/json; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}
    headers = case AllowedOrigins.acao(origin) do
      nil -> headers
      allowed -> Map.put(headers, "access-control-allow-origin", allowed)
    end
    :cowboy_req.reply(status, headers, IO.iodata_to_binary(:json.encode(map)), req)
  end
end
