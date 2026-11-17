# Recorrido completo de un pedido por la capa real (PostgREST). Requiere en la base de pruebas un pedido con id ...0901
# (tienda 161, comprador u1, a domicilio, estado oferta_aceptada). Ver LEEME.txt.
import json, urllib.request, subprocess, sys
O="00000000-0000-0000-0000-000000000901"
U=lambda n: f"00000000-0000-0000-0000-{n:012d}"
tok=lambda n,e: subprocess.check_output(["python3","jwt.py",U(n),e]).decode().strip()
T={"u1":tok(1,"ana.compradora@prueba.test"),"u2":tok(2,"beto.comprador@prueba.test"),"u3":tok(3,"carla.moda@prueba.test"),"u4":tok(4,"dario.ferreteria@prueba.test")}
def llamar(q, metodo, ruta, cuerpo=None, extra=None):
    h={"Authorization":"Bearer "+T[q],"Content-Type":"application/json"}
    if extra: h.update(extra)
    r=urllib.request.Request("http://127.0.0.1:3000"+ruta, data=(json.dumps(cuerpo).encode() if cuerpo is not None else None), method=metodo, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=10) as x: return x.status, json.loads(x.read() or b"null")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
mal=0
def chk(n, c, d=""):
    global mal
    print(("OK   " if c else "FALLA"), n, d)
    if not c: mal+=1
rpc=lambda q,f,b: llamar(q,"POST","/rpc/"+f,b)
c,_=rpc("u2","avanzar_pedido",{"p_order":O,"p_estado":"compra_coordinada"}); chk("otro comprador no avanza el pedido", c>=400, f"código {c}")
c,_=rpc("u1","avanzar_pedido",{"p_order":O,"p_estado":"compra_coordinada"}); chk("el comprador no avanza el pedido", c>=400, f"código {c}")
c,r=rpc("u3","avanzar_pedido",{"p_order":O,"p_estado":"en_preparacion"}); chk("no se salta ningún paso (mensaje claro)", c>=400 and "no está permitido" in r.get("message",""), r.get("message","")[:60] if isinstance(r,dict) else "")
c,_=rpc("u3","avanzar_pedido",{"p_order":O,"p_estado":"compra_coordinada"}); chk("la tienda confirma la compra coordinada", c in (200,204), f"código {c}")
c,_=rpc("u3","avanzar_pedido",{"p_order":O,"p_estado":"en_preparacion"}); chk("la tienda pasa a preparación", c in (200,204))
# fotos
c,r=llamar("u3","POST","/delivery_evidence",{"order_id":O,"type":"producto_completo","file_path":"otra/x.jpg","uploaded_by":U(3)}); chk("la foto debe ir en la carpeta del pedido", c==400 and "carpeta" in r.get("message",""))
for t in ("producto_completo","detalle_estado","producto_en_paquete"):
    c,_=llamar("u3","POST","/delivery_evidence",{"order_id":O,"type":t,"file_path":f"{O}/{t}.jpg","uploaded_by":U(3)}); chk(f"se sube la foto «{t}»", c==201, f"código {c}")
c,r=rpc("u3","avanzar_pedido",{"p_order":O,"p_estado":"evidencias_registradas"}); chk("con 3 de 4 fotos no se registran las evidencias", c>=400 and "Faltan fotos" in r.get("message",""), r.get("message","")[:70] if isinstance(r,dict) else "")
c,_=llamar("u1","POST","/delivery_evidence",{"order_id":O,"type":"paquete_cerrado","file_path":f"{O}/x.jpg","uploaded_by":U(1)}); chk("el comprador no sube fotos de la tienda", c in (401,403), f"código {c}")
c,_=llamar("u3","POST","/delivery_evidence",{"order_id":O,"type":"paquete_cerrado","file_path":f"{O}/paquete_cerrado.jpg","uploaded_by":U(3)}); chk("se sube la cuarta foto", c==201)
c,_=rpc("u3","avanzar_pedido",{"p_order":O,"p_estado":"evidencias_registradas"}); chk("con las 4 fotos se registran las evidencias", c in (200,204))
c,r=llamar("u1","GET",f"/delivery_evidence?select=type,file_path&order_id=eq.{O}"); chk("el comprador ve las 4 fotos", c==200 and len(r)==4)
c,r=llamar("u2","GET",f"/delivery_evidence?select=type&order_id=eq.{O}"); chk("otro comprador no ve ninguna", c==200 and len(r)==0)
c,_=rpc("u3","avanzar_pedido",{"p_order":O,"p_estado":"enviado_o_listo"}); chk("la tienda marca el pedido como enviado", c in (200,204))
# código
c,r=rpc("u1","obtener_codigo_entrega",{"p_order":O}); codigo=(r[0]["codigo"] if c==200 and r else None)
chk("el comprador ve su código de 6 dígitos", c==200 and bool(codigo) and len(codigo)==6 and codigo.isdigit(), f"intentos {r[0]['intentos'] if c==200 and r else '?'}")
c,r=rpc("u3","obtener_codigo_entrega",{"p_order":O}); chk("la tienda NO puede ver el código", c>=400, r.get("message","") if isinstance(r,dict) else "")
c,r=llamar("u3","GET","/delivery_codes?select=*"); chk("la tabla de códigos no se puede leer", c in (401,403), f"código {c}")
c,r=llamar("u1","GET","/delivery_codes?select=*"); chk("ni el comprador puede leer la tabla de códigos", c in (401,403), f"código {c}")
c,r=rpc("u1","confirmar_entrega",{"p_order":O,"p_codigo":codigo}); chk("el comprador no confirma su propia entrega", c>=400)
c,r=rpc("u3","confirmar_entrega",{"p_order":O,"p_codigo":"abc"}); chk("código mal escrito → «formato»", c==200 and r.get("resultado")=="formato")
malo="111111" if codigo!="111111" else "222222"
c,r=rpc("u3","confirmar_entrega",{"p_order":O,"p_codigo":malo}); chk("código incorrecto → «incorrecto» con intentos restantes", c==200 and r.get("resultado")=="incorrecto" and r.get("intentos_restantes")==4, json.dumps(r))
c,r=rpc("u3","confirmar_entrega",{"p_order":O,"p_codigo":codigo}); chk("código correcto → «correcto»", c==200 and r.get("resultado")=="correcto", json.dumps(r))
c,r=rpc("u3","confirmar_entrega",{"p_order":O,"p_codigo":codigo}); chk("un código usado no se reutiliza", c>=400)
c,r=llamar("u1","GET",f"/delivery_events?select=event,to_status&order_id=eq.{O}&order=created_at"); chk("el historial registra todos los pasos", c==200 and len(r)==5 and r[-1]["event"]=="entrega_confirmada", f"{len(r)} eventos (4 cambios de estado + la entrega confirmada)")
c,r=rpc("u1","mis_pedidos",{}); mio=[x for x in r if x["order_id"]==O] if c==200 else []
chk("el comprador ve el pedido entregado en su lista", len(mio)==1 and mio[0]["estado"]=="entregado" and mio[0]["mi_rol"]=="comprador" and mio[0]["fotos_obligatorias"]==4, f"estado {mio[0]['estado'] if mio else '?'}")
c,r=rpc("u2","mis_pedidos",{}); chk("otro comprador no lo ve", c==200 and not any(x["order_id"]==O for x in r))
c,_=rpc("u3","completar_pedido",{"p_order":O}); chk("la tienda no completa la operación", c>=400)
c,_=rpc("u1","completar_pedido",{"p_order":O}); chk("el comprador completa la operación", c in (200,204))
print("\nResultado:", "pedidos y código de entrega responden como se espera por la capa real" if mal==0 else f"{mal} problema(s)")
sys.exit(1 if mal else 0)
