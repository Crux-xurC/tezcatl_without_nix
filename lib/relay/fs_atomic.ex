defmodule FsAtomic do
  # A whole file written so that it is either the old one or the new one,
  # never half : the bytes go to a temporary file
  # next to it, then rename(2) puts it in place. A crash, a full disk or a
  # killed relay in the middle leaves the old file as it was.
  #
  # The mode of a file already there is kept. A symlink is written through
  # (to the file it points at): renaming over the link would replace it
  # with a plain file.

  @doc "Write `bytes` to `path` -> :ok | {:error, reason}"
  def write(path, bytes) do
    target = resolve_link(path)
    tmp = Path.join(Path.dirname(target), "." <> Path.basename(target) <> ".tezcatl-" <> Integer.to_string(System.unique_integer([:positive])) <> ".tmp")

    with :ok <- File.write(tmp, bytes),
         :ok <- keep_mode(target, tmp),
         :ok <- File.rename(tmp, target) do
      :ok
    else
      {:error, _} = e ->
        _ = File.rm(tmp)
        e
    end
  end

  defp keep_mode(target, tmp) do
    case File.stat(target) do
      {:ok, %File.Stat{mode: mode}} -> File.chmod(tmp, Bitwise.band(mode, 0o7777))
      {:error, :enoent} -> :ok
      {:error, _} = e -> e
    end
  end

  # the file a symlink (or a chain of them) points at; the path itself otherwise
  defp resolve_link(path, hops \\ 0) do
    case :file.read_link_info(String.to_charlist(path)) do
      {:ok, info} when elem(info, 2) == :symlink and hops < 20 ->
        {:ok, to} = :file.read_link(String.to_charlist(path))
        resolve_link(Path.expand(List.to_string(to), Path.dirname(path)), hops + 1)

      _ ->
        path
    end
  end
end
