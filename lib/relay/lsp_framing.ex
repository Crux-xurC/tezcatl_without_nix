defmodule LspFraming do
  # The LSP base protocol framing: JSON-RPC bodies prefixed with
  #   Content-Length: <n>\r\n\r\n
  # (an optional Content-Type header is tolerated and ignored). Pure -- the
  # accumulator lives in LspServer's state.
  #
  #   new()                      -> state
  #   feed(state, bytes)         -> {[body, ...], state}   bodies are raw JSON strings
  #   feed_report(state, bytes)  -> {[body, ...], [dropped, ...], state}
  #   encode(body)               -> iodata ready for the server's stdin
  #
  # Bytes that are not a frame (a wrapper script or the server itself printing
  # a line on stdout before or between frames) are dropped up to the next
  # `Content-Length:` and reported (`dropped`), so the frames after them still
  # come through. Dropping the whole header block instead left the frame's
  # body in front of the next header, and every frame from then on was lost
  # without a word.

  @sep "\r\n\r\n"

  def new, do: %{buf: ""}

  def feed(state, bytes) when is_binary(bytes) do
    {bodies, _dropped, state} = feed_report(state, bytes)
    {bodies, state}
  end

  def feed_report(%{buf: buf} = state, bytes) when is_binary(bytes) do
    do_feed(%{state | buf: buf <> bytes}, [], [])
  end

  defp do_feed(state, acc, dropped) do
    case take_one(state.buf) do
      {:ok, body, rest} -> do_feed(%{state | buf: rest}, [body | acc], dropped)
      {:skip, junk, rest} -> do_feed(%{state | buf: rest}, acc, [junk | dropped])
      :more -> {Enum.reverse(acc), Enum.reverse(dropped), state}
    end
  end

  defp take_one(buf) do
    case :binary.split(buf, @sep) do
      [_incomplete] ->
        :more

      [headers, after_headers] ->
        case content_length(headers) do
          nil ->
            # A header block with no usable Content-Length is a protocol
            # violation. When a `Content-Length:` is in there after other
            # bytes (stray output, then a real header), only what is before
            # it goes and the frame is read again from there; otherwise the
            # block (and its separator) goes, so the buffer never wedges.
            # (byte offsets: the stray bytes need not be UTF-8)
            case Regex.scan(~r/content-length:/i, headers, return: :index) |> List.last() do
              [{at, _}] when at > 0 -> {:skip, binary_part(buf, 0, at), binary_part(buf, at, byte_size(buf) - at)}
              _ -> {:skip, headers, after_headers}
            end

          n when byte_size(after_headers) >= n ->
            <<body::binary-size(n), rest::binary>> = after_headers
            {:ok, body, rest}

          _ ->
            :more
        end
    end
  end

  defp content_length(headers) do
    headers
    |> String.split("\r\n")
    |> Enum.find_value(fn line ->
      case String.split(line, ":", parts: 2) do
        [k, v] ->
          if String.downcase(String.trim(k)) == "content-length" do
            case Integer.parse(String.trim(v)) do
              {n, ""} when n >= 0 -> n
              _ -> nil
            end
          end

        _ ->
          nil
      end
    end)
  end

  def encode(body) when is_binary(body) do
    ["Content-Length: ", Integer.to_string(byte_size(body)), @sep, body]
  end
end
