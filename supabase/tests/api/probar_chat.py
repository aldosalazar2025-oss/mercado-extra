import json, urllib.request, urllib.parse, subprocess, sys
import os
CONV=os.environ["CONV"]  # id de la conversación de la solicitud 350 en la base de pruebas
U=lambda n: f"00000000-0000-0000-0000-{n:012d}"
tok=lambda n,e: subprocess.check_output(["python3","jwt.py",U(n),e]).decode().strip()
T={"u1":tok(1,"ana.compradora@prueba.test"),"u2":tok(2,"beto.comprador@prueba.test"),"u3":tok(3,"carla.moda@prueba.test"),"u6":tok(6,"fito.productos@prueba.test")}
def llamar(quien, metodo, ruta, cuerpo=None, extra=None):
    h={"Authorization":"Bearer "+T[quien],"Content-Type":"application/json"}
    if extra: h.update(extra)
    r=urllib.request.Request("http://127.0.0.1:3000"+ruta, data=(json.dumps(cuerpo).encode() if cuerpo is not None else None), method=metodo, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=10) as x: return x.status, json.loads(x.read() or b"null")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
mal=0
def chk(nombre, cond, detalle=""):
    global mal
    print(("OK   " if cond else "FALLA"), nombre, detalle)
    if not cond: mal+=1
# enviar y leer
c,_=llamar("u1","POST","/messages",{"conversation_id":CONV,"sender_id":U(1),"body":"Hola desde la prueba de API"})
chk("el comprador envía un mensaje (201)", c==201, f"código {c}")
c,r=llamar("u1","GET",f"/messages?select=id,conversation_id,sender_id,body,image_path,created_at&conversation_id=eq.{CONV}&order=created_at.desc&limit=100")
chk("el comprador lee el historial", c==200 and any(m["body"]=="Hola desde la prueba de API" for m in r), f"{len(r)} mensajes")
c,r=llamar("u3","GET",f"/messages?select=id&conversation_id=eq.{CONV}")
chk("la tienda elegida lee la conversación", c==200 and len(r)>0)
c,r=llamar("u2","GET",f"/messages?select=id&conversation_id=eq.{CONV}")
chk("otro comprador no ve ningún mensaje", c==200 and len(r)==0)
c,r=llamar("u6","GET",f"/messages?select=id&conversation_id=eq.{CONV}")
chk("un empleado sin permiso de chat no ve ningún mensaje", c==200 and len(r)==0)
c,r=llamar("u2","POST","/messages",{"conversation_id":CONV,"sender_id":U(2),"body":"intruso"})
chk("otro comprador no puede escribir", c in (401,403), f"código {c}")
c,r=llamar("u1","POST","/messages",{"conversation_id":CONV,"sender_id":U(3),"body":"suplantación con tildes, ñ y emoji 😀"})
chk("no se puede escribir como otra persona", c in (401,403), f"código {c}")
c,r=llamar("u1","POST","/messages",{"conversation_id":CONV,"sender_id":U(1),"image_path":"otra-carpeta/x.jpg"})
chk("la foto debe ir en la carpeta de la conversación (mensaje claro)", c==400 and "carpeta" in json.dumps(r), r.get("message","") if isinstance(r,dict) else "")
c,r=llamar("u1","POST","/messages",{"conversation_id":CONV,"sender_id":U(1),"image_path":f"{CONV}/foto-api.jpg"})
chk("se envía una foto válida", c==201, f"código {c}")
# lista y lectura
c,r=llamar("u3","POST","/rpc/mis_conversaciones",{})
mia=[x for x in r if x["conversation_id"]==CONV] if c==200 else []
chk("la tienda ve la conversación en su lista, como vendedor", c==200 and len(mia)==1 and mia[0]["mi_rol"]=="vendedor" and isinstance(mia[0]["no_leidos"],(int,float)), f"sin leer: {mia[0]['no_leidos'] if mia else '?'}")
chk("la lista trae el nombre del comprador y el pedido", bool(mia) and bool(mia[0]["comprador"]) and mia[0]["estado_pedido"] is not None, f"{mia[0]['comprador']} · {mia[0]['estado_pedido']}" if mia else "")
c,r=llamar("u3","POST","/rpc/marcar_conversacion_leida",{"p_conversation":CONV})
chk("la tienda marca la conversación como leída", c in (200,204), f"código {c}")
c,r=llamar("u3","POST","/rpc/mis_conversaciones",{})
mia=[x for x in r if x["conversation_id"]==CONV]
chk("y le quedan 0 sin leer", len(mia)==1 and int(mia[0]["no_leidos"])==0)
c,r=llamar("u2","POST","/rpc/marcar_conversacion_leida",{"p_conversation":CONV})
chk("otro comprador no puede marcar la conversación", c>=400, r.get("message","") if isinstance(r,dict) else "")
# no se puede editar ni borrar
c,r=llamar("u1","PATCH",f"/messages?conversation_id=eq.{CONV}",{"body":"editado"},{"Prefer":"return=representation"})
chk("los mensajes no se editan", c in (200,204,401,403) and (r==[] or c>=400 or r is None), f"código {c}")
c,r=llamar("u1","DELETE",f"/messages?conversation_id=eq.{CONV}",None,{"Prefer":"return=representation"})
chk("los mensajes no se borran", r==[] or c>=400 or r is None, f"código {c}")
print("\nResultado:", "el chat responde como se espera por la capa real" if mal==0 else f"{mal} problema(s)")
sys.exit(1 if mal else 0)
