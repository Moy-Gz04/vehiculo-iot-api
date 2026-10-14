"""Errores de negocio y su traducción a códigos HTTP."""


class ErrorNegocio(Exception):
    codigo_http = 400

    def __init__(self, mensaje: str) -> None:
        super().__init__(mensaje)
        self.mensaje = mensaje


class NoEncontrado(ErrorNegocio):
    codigo_http = 404


class Conflicto(ErrorNegocio):
    codigo_http = 409


class SolicitudInvalida(ErrorNegocio):
    codigo_http = 400


class Prohibido(ErrorNegocio):
    codigo_http = 403
