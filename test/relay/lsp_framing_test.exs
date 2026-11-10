

defmodule LspFramingTest do
  use ExUnit.Case, async: true

  defp frame(body), do: IO.iodata_to_binary(LspFraming.encode(body))

  test "encode/1 produces a Content-Length prefix and the body" do
    assert frame(~s({"a":1})) == "Content-Length: 7\r\n\r\n" <> ~s({"a":1})
  end

  test "one whole message in one feed" do
    {msgs, _st} = LspFraming.feed(LspFraming.new(), frame(~s({"jsonrpc":"2.0"})))
    assert msgs == [~s({"jsonrpc":"2.0"})]
  end

  test "several messages in one feed" do
    buf = frame("A1") <> frame("BB2") <> frame("CCC3")
    {msgs, st} = LspFraming.feed(LspFraming.new(), buf)
    assert msgs == ["A1", "BB2", "CCC3"]
    assert st.buf == ""
  end

  test "a message split across feeds is buffered then completed" do
    whole = frame(~s({"x":"hello"}))
    {a, b} = String.split_at(whole, 12)
    {m1, st1} = LspFraming.feed(LspFraming.new(), a)
    assert m1 == []
    {m2, st2} = LspFraming.feed(st1, b)
    assert m2 == [~s({"x":"hello"})]
    assert st2.buf == ""
  end

  test "the header/body separator itself split across feeds" do
    whole = frame("body")
    # cut in the middle of \r\n\r\n
    {a, b} = String.split_at(whole, byte_size("Content-Length: 4\r\n"))
    {m1, st1} = LspFraming.feed(LspFraming.new(), a)
    assert m1 == []
    {m2, _} = LspFraming.feed(st1, b)
    assert m2 == ["body"]
  end

  test "trailing partial message stays in the buffer" do
    buf = frame("done") <> "Content-Length: 10\r\n\r\nhalf"
    {msgs, st} = LspFraming.feed(LspFraming.new(), buf)
    assert msgs == ["done"]
    assert st.buf == "Content-Length: 10\r\n\r\nhalf"
    {msgs2, st2} = LspFraming.feed(st, "way")
    assert msgs2 == []
    {msgs3, _} = LspFraming.feed(st2, "abc")
    assert msgs3 == ["halfwayabc"]
  end

  test "an extra Content-Type header is tolerated" do
    raw =
      "Content-Length: 2\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n{}"

    {msgs, _} = LspFraming.feed(LspFraming.new(), raw)
    assert msgs == ["{}"]
  end

  test "a byte-count body (multibyte) is measured in bytes, not codepoints" do
    body = ~s({"t":"あいう"})
    assert byte_size(body) == 17 and String.length(body) == 11
    {msgs, _} = LspFraming.feed(LspFraming.new(), frame(body))
    assert msgs == [body]
  end

  test "a header block with no Content-Length is skipped, not wedged" do
    buf = "X-Bogus: 1\r\n\r\n" <> frame("real")
    {msgs, st} = LspFraming.feed(LspFraming.new(), buf)
    assert msgs == ["real"]
    assert st.buf == ""
  end

  test "a line printed on stdout before a frame is dropped and reported; the frames after it come through" do
    # ending in LF only (a shell wrapper's echo): the stray line shares the header block
    buf = "warning: something\n" <> frame("one") <> frame("two") <> frame("three")
    {msgs, dropped, st} = LspFraming.feed_report(LspFraming.new(), buf)
    assert msgs == ["one", "two", "three"]
    assert dropped == ["warning: something\n"]
    assert st.buf == ""
    assert LspFraming.feed(LspFraming.new(), buf) == {msgs, st}
  end

  test "stray bytes between frames, not UTF-8, split across feeds" do
    {m1, d1, st} = LspFraming.feed_report(LspFraming.new(), frame("one") <> <<0xFF, 0xFE>> <> "noise\nContent-Le")
    {m2, d2, st} = LspFraming.feed_report(st, "ngth: 3\r\n\r\ntwo" <> frame("three"))
    assert m1 ++ m2 == ["one", "two", "three"]
    assert d1 ++ d2 == [<<0xFF, 0xFE>> <> "noise\n"]
    assert st.buf == ""
  end

  test "a Content-Length that cannot be read drops its block, as before" do
    {msgs, dropped, st} = LspFraming.feed_report(LspFraming.new(), "Content-Length: many\r\n\r\n" <> frame("real"))
    assert msgs == ["real"]
    assert dropped == ["Content-Length: many"]
    assert st.buf == ""
  end
end
