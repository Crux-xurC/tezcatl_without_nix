defmodule FsGrep do
  # ripgrep for GET /fs/grep (lib/relay/fs_handler.exs answers the request):
  # rg --json run under the FS root, its match lines read into
  # {"path","line","col","text"} -- path from the root, line and col 1-based
  # (col in characters), text trimmed to 400 characters. Stopped at `limit`
  # matches or after 10s (truncated). Split out of fs_handler.exs.

  @ms 10_000

  @doc "ripgrep for `pattern` under `target` (relative to `root`), at most `limit` matches -> {matches, truncated?, error | nil}"
  def run(rg, root, pattern, target, limit) do
    args = ["--json", "--smart-case", "--max-columns", "2000", "-e", pattern, "--", target]
    port = Port.open({:spawn_executable, rg}, [:binary, :exit_status, :stderr_to_stdout, {:line, 1_000_000}, {:args, args}, {:cd, root}])
    deadline = System.monotonic_time(:millisecond) + @ms
    collect(port, deadline, limit, [], 0, "")
  end

  defp collect(port, deadline, limit, acc, n, errs) do
    left = max(deadline - System.monotonic_time(:millisecond), 0)

    receive do
      {^port, {:data, {:eol, line}}} ->
        case decode_rg(line) do
          {:match, m} ->
            if n + 1 >= limit do
              close(port)
              {Enum.reverse([m | acc]), true, nil}
            else
              collect(port, deadline, limit, [m | acc], n + 1, errs)
            end

          :other -> collect(port, deadline, limit, acc, n, errs)
          :text -> collect(port, deadline, limit, acc, n, errs <> line <> "\n")
        end

      {^port, {:data, {:noeol, _}}} ->
        collect(port, deadline, limit, acc, n, errs)

      # rg: 0 found, 1 nothing found, 2 an error (a bad pattern, or some unreadable files)
      {^port, {:exit_status, 2}} when acc == [] and errs != "" ->
        {[], false, String.trim(errs)}

      {^port, {:exit_status, _}} ->
        {Enum.reverse(acc), false, nil}
    after
      left ->
        close(port)
        {Enum.reverse(acc), true, nil}
    end
  end

  defp close(port) do
    try do
      Port.close(port)
    catch
      _, _ -> :ok
    end
  end

  defp decode_rg(line) do
    case (try do :json.decode(line) rescue _ -> :bad catch _, _ -> :bad end) do
      %{"type" => "match", "data" => %{"path" => %{"text" => p}, "lines" => %{"text" => t}, "line_number" => ln, "submatches" => subs}} ->
        start = case subs do [%{"start" => s} | _] -> s; _ -> 0 end
        col = String.length(binary_part(t, 0, min(start, byte_size(t)))) + 1
        text = t |> String.trim_trailing() |> String.slice(0, 400)
        {:match, %{"path" => String.replace_prefix(p, "./", ""), "line" => ln, "col" => col, "text" => text}}

      %{"type" => _} -> :other
      _ -> :text
    end
  end
end
