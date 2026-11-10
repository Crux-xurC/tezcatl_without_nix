defmodule PtyFlow do
  use GenServer
  require Logger

  @cap 1_048_576
  @chunk 65_536

  def start_link(conn) when is_pid(conn), do: GenServer.start_link(__MODULE__, conn)

  def set_ospid(flow, ospid) when is_pid(flow), do: send(flow, {:set_ospid, ospid})
  def set_ospid(_, _), do: :ok

  def request(flow, conn) when is_pid(flow) and is_pid(conn), do: send(flow, {:want, conn})
  def request(_, _), do: :ok

  def stop(flow) when is_pid(flow) do
    try do
      GenServer.stop(flow, :normal, 1_000)
    catch
      _, _ -> :ok
    end
  end

  def stop(_), do: :ok

  def new(conn) do
    %{
      conn: conn,
      buf: [],
      bufsize: 0,
      dropped: 0,
      want: false,
      ospid: nil
    }
  end

  def feed(state, bytes) when is_binary(bytes) do
    n = byte_size(bytes)

    if state.bufsize + n > @cap do
      %{state | buf: [], bufsize: 0, dropped: state.dropped + state.bufsize + n}
    else
      %{state | buf: [state.buf | bytes], bufsize: state.bufsize + n}
    end
  end

  def mark_want(state), do: %{state | want: true}

  def pull(%{want: false} = state), do: {:empty, state}
  def pull(%{buf: [], bufsize: 0, dropped: 0} = state), do: {:empty, state}

  def pull(state) do
    bin = IO.iodata_to_binary(state.buf)
    take = min(@chunk, byte_size(bin))
    <<chunk::binary-size(take), rest::binary>> = bin
    payload = ris_marker(state.dropped) <> chunk

    {:frame, payload,
     %{
       state
       | buf: if(rest == "", do: [], else: [rest]),
         bufsize: byte_size(rest),
         dropped: 0,
         want: false
     }}
  end

  def limits, do: {@cap, @chunk}

  defp ris_marker(0), do: <<>>

  defp ris_marker(n) do
    "\ec\r\n[tezcatl: #{n} bytes of output were cut -- the terminal was reset]\r\n"
  end

  @impl true
  def init(conn), do: {:ok, new(conn)}

  @impl true
  def handle_info({stream, _ospid, data}, state)
      when stream in [:stdout, :stderr] and is_binary(data) do
    {:noreply, flush(feed(state, data))}
  end

  def handle_info({:want, conn}, state) do
    {:noreply, flush(mark_want(%{state | conn: conn}))}
  end

  def handle_info({:set_ospid, ospid}, state), do: {:noreply, %{state | ospid: ospid}}

  def handle_info(_other, state), do: {:noreply, state}

  defp flush(state) do
    case pull(state) do
      {:frame, bin, st} ->
        send(st.conn, {:pty_out, bin})
        st

      {:empty, st} ->
        st
    end
  end

end
