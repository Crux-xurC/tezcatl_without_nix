defmodule FsValidate do
  # A path that starts with this names the work place (tezcatl's own
  # temporary files: clones, the scratch), the second root of /fs.
  @work "~work"

  def work_prefix, do: @work

  # -> {:ok, abs, :root | :work}: under which of the two roots the path is.
  # "~work" and "~work/..." are under work_root, anything else under root (so
  # a file of the FS root named "~work" itself cannot be reached).
  def locate(root, work_root, rel) when is_binary(root) and is_binary(work_root) do
    case rel do
      @work -> tag(resolve(work_root, ""), :work)
      @work <> "/" <> rest -> tag(resolve(work_root, rest), :work)
      _ -> tag(resolve(root, rel), :root)
    end
  end

  defp tag({:ok, abs}, which), do: {:ok, abs, which}
  defp tag(err, _which), do: err

  def resolve(root, rel) when is_binary(root) do
    with {:ok, rel} <- normalize_rel(rel) do
      abs = Path.expand(rel, root)
      root = Path.expand(root)

      cond do
        abs == root -> {:ok, abs}
        String.starts_with?(abs, root <> "/") -> {:ok, abs}
        true -> {:error, "path escapes the root"}
      end
    end
  end

  defp normalize_rel(nil), do: {:ok, "."}
  defp normalize_rel(""), do: {:ok, "."}

  defp normalize_rel(rel) when is_binary(rel) do
    cond do
      String.contains?(rel, <<0>>) -> {:error, "path contains a NUL byte"}
      String.starts_with?(rel, "/") -> {:error, "path must be relative to the root"}
      true -> {:ok, rel}
    end
  end

  defp normalize_rel(_), do: {:error, "path must be a string"}
end
