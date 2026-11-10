# stdin: the buffer; argv: its path (for the messages only)
[file] = System.argv()
src = IO.read(:stdio, :eof)
case Code.string_to_quoted(src, file: file, columns: true, emit_warnings: false) do
  {:ok, _} ->
    :ok

  {:error, {meta, msg, token}} ->
    {line, col} = if is_list(meta), do: {meta[:line] || 1, meta[:column] || 1}, else: {meta, 1}
    msg = case msg do
      {a, b} -> a <> b
      m -> m
    end
    IO.puts("#{file}:#{line}:#{col}: error: #{String.replace(msg <> token, "\n", " ")}")
end
