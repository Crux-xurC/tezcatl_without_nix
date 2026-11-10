defmodule LspOwners do
  # Who owns each open document of a shared language server (D-lsp-owner).
  # Pure -- the state lives in LspServer's.
  #
  # The server holds one text per URI and knows one client (the relay): it
  # cannot tell whose edit is whose. Two consumers editing one URI made one
  # text out of two -- each one's didChange applied to a text holding the
  # other's edits, so diagnostics, and the edits of a rename or a format,
  # landed in the wrong places. So one consumer owns a URI:
  #
  #  - the first to open it owns it; the server gets its didOpen
  #  - an editor (attached with "client":"editor") opening a URI another kind
  #    owns (xipe_totec's scanner) takes it over: didClose, then the editor's
  #    didOpen -- the server holds the text a person is editing. The scanner
  #    already checks what it reads against the disk.
  #  - any other opener only holds it: its didOpen, didChange, didSave,
  #    didClose are not sent on, it gets no diagnostics of that URI, and an
  #    editor's request about it is refused (positions in its text are not
  #    the server's). An editor that only holds is told (held).
  #  - when the owner closes it (or goes), the server gets didClose, and the
  #    first editor still holding it is told (released): it opens it again,
  #    with its own text, and owns it.
  #
  # One server per client was not chosen: every consumer of a project runs the
  # same server, one version of it (crux, 2026-10-15).
  #
  #   new()                                  -> state
  #   open(st, uri, c, editor?)              -> {actions, st}
  #   close(st, uri, c, editor?)             -> {actions, st}
  #   leave(st, c, editor?)                  -> {actions, st}   c is gone: close all it holds
  #   owner(st, uri)                         -> c | nil
  #   may_change?(st, uri, c)                -> its notifications about uri go on
  #   docs(st)                               -> how many URIs are open
  # editor?: fn c -> boolean. actions, in order:
  #   {:forward, uri}       send the consumer's own message on
  #   {:server_close, uri}  send the server a didClose of uri (the relay's own)
  #   {:held, c, uri}       tell c it only holds uri
  #   {:released, c, uri}   tell c to open uri again (it may own it now)

  def new, do: %{owner: %{}, holders: %{}}

  def owner(st, uri), do: Map.get(st.owner, uri)

  def may_change?(st, uri, c) do
    case owner(st, uri) do
      nil -> true
      ^c -> true
      _ -> false
    end
  end

  def docs(st), do: map_size(st.holders)

  def open(st, uri, c, editor?) do
    held = Map.get(st.holders, uri, [])
    st = if c in held, do: st, else: put_in(st.holders[uri], held ++ [c])

    case owner(st, uri) do
      nil ->
        {[{:forward, uri}], put_in(st.owner[uri], c)}

      ^c ->
        {[], st}

      other ->
        cond do
          editor?.(c) and not editor?.(other) ->
            {[{:server_close, uri}, {:forward, uri}], put_in(st.owner[uri], c)}

          editor?.(c) ->
            {[{:held, c, uri}], st}

          true ->
            {[], st}
        end
    end
  end

  def close(st, uri, c, editor?) do
    held = Map.get(st.holders, uri, [])

    if c in held do
      rest = List.delete(held, c)
      st = if rest == [], do: %{st | holders: Map.delete(st.holders, uri)}, else: put_in(st.holders[uri], rest)

      if owner(st, uri) == c do
        st = %{st | owner: Map.delete(st.owner, uri)}

        case Enum.find(rest, editor?) do
          nil -> {[{:server_close, uri}], st}
          next -> {[{:server_close, uri}, {:released, next, uri}], st}
        end
      else
        {[], st}
      end
    else
      {[], st}
    end
  end

  def leave(st, c, editor?) do
    st.holders
    |> Enum.filter(fn {_uri, held} -> c in held end)
    |> Enum.map(fn {uri, _} -> uri end)
    |> Enum.sort()
    |> Enum.reduce({[], st}, fn uri, {acc, st} ->
      {actions, st} = close(st, uri, c, editor?)
      {acc ++ actions, st}
    end)
  end
end
