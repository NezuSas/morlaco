import http.client
import socket
import urllib.error

from morlaco import red


def test_que_errores_son_de_red():
    assert red.es_error_de_red(urllib.error.URLError(socket.gaierror(-3, "Temporary failure")))
    assert red.es_error_de_red(TimeoutError("timed out"))
    assert red.es_error_de_red(ConnectionResetError())
    assert red.es_error_de_red(http.client.RemoteDisconnected("cerró"))
    assert red.es_error_de_red(urllib.error.HTTPError("https://x", 503, "Unavailable", {}, None))
    assert not red.es_error_de_red(urllib.error.HTTPError("https://x", 404, "Not Found", {}, None))
    assert not red.es_error_de_red(ValueError("formato"))
    assert not red.es_error_de_red(KeyError("features"))
