

defmodule PtyFlowTest do
  use ExUnit.Case, async: true

  defp cap, do: elem(PtyFlow.limits(), 0)
  defp chunk, do: elem(PtyFlow.limits(), 1)
  defp s, do: PtyFlow.new(:conn)

  test "new/1 starts empty, not wanting" do
    st = s()
    assert st.conn == :conn
    assert st.buf == []
    assert st.bufsize == 0
    assert st.dropped == 0
    assert st.want == false
  end

  test "feed/2 under the cap accumulates as an iolist with a size counter" do
    st = s() |> PtyFlow.feed("abc") |> PtyFlow.feed("de")
    assert st.bufsize == 5
    assert IO.iodata_to_binary(st.buf) == "abcde"
    assert st.dropped == 0
  end

  test "pull/1 does nothing until the cowboy process asks" do
    st = s() |> PtyFlow.feed("hello")
    assert {:empty, ^st} = PtyFlow.pull(st)
  end

  test "pull/1 after mark_want returns one frame and clears want" do
    st = s() |> PtyFlow.feed("hello") |> PtyFlow.mark_want()
    assert {:frame, "hello", st2} = PtyFlow.pull(st)
    assert st2.want == false
    assert st2.bufsize == 0
    assert {:empty, _} = PtyFlow.pull(st2)
  end

  test "mark_want with nothing buffered stays :empty and keeps wanting" do
    st = s() |> PtyFlow.mark_want()
    assert {:empty, st2} = PtyFlow.pull(st)
    assert st2.want == true
    st3 = PtyFlow.feed(st2, "x")
    assert {:frame, "x", _} = PtyFlow.pull(st3)
  end

  test "pull/1 caps a frame at @chunk bytes and keeps the remainder" do
    big = String.duplicate("a", chunk() + 100)
    st = s() |> PtyFlow.feed(big) |> PtyFlow.mark_want()
    assert {:frame, frame, st2} = PtyFlow.pull(st)
    assert byte_size(frame) == chunk()
    assert st2.bufsize == 100
    st3 = PtyFlow.mark_want(st2)
    assert {:frame, tail, _} = PtyFlow.pull(st3)
    assert byte_size(tail) == 100
  end

  test "feed/2 past @cap sheds everything pending and counts the loss" do
    st = s() |> PtyFlow.feed(String.duplicate("a", cap() - 10))
    assert st.bufsize == cap() - 10
    st = PtyFlow.feed(st, String.duplicate("b", 50))
    assert st.buf == []
    assert st.bufsize == 0
    assert st.dropped == cap() - 10 + 50
  end

  test "the frame after a shed is prefixed with RIS (ESC c) + a byte-count marker" do
    st =
      s()
      |> PtyFlow.feed(String.duplicate("a", cap() - 10))
      |> PtyFlow.feed(String.duplicate("b", 50))
      |> PtyFlow.feed("fresh")
      |> PtyFlow.mark_want()

    assert {:frame, frame, st2} = PtyFlow.pull(st)
    assert String.starts_with?(frame, "\ec")
    assert frame =~ "#{cap() - 10 + 50} bytes of output were cut"
    assert String.ends_with?(frame, "fresh")
    assert st2.dropped == 0
  end

  test "a want with only dropped bytes (no fresh data) still emits the marker" do
    st =
      s()
      |> PtyFlow.feed(String.duplicate("a", cap() - 10))
      |> PtyFlow.feed(String.duplicate("b", 50))
      |> PtyFlow.mark_want()

    assert {:frame, frame, st2} = PtyFlow.pull(st)
    assert String.starts_with?(frame, "\ec")
    assert st2.buf == []
    assert st2.dropped == 0
    assert {:empty, _} = PtyFlow.pull(st2)
  end
end
