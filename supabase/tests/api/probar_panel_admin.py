# Caso real reportado: una cuenta administradora que también es dueña de una tienda veía en su panel de vendedor
# las solicitudes de TODAS las tiendas. El panel debe filtrar por las tiendas propias (store_id=in.(...)).
# Requiere PostgREST en marcha y, en la base de pruebas, una tienda 170 (admin u7) y 171 (otra cuenta) de la misma categoría
# con una solicitud abierta (ver docs/REGISTRO.md). Se deja como referencia.
