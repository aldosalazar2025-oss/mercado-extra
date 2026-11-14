import hmac, hashlib, base64, json, sys, time
def b64(d): return base64.urlsafe_b64encode(d).rstrip(b"=").decode()
def jwt(sub, email):
    h=b64(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    p=b64(json.dumps({"sub":sub,"role":"authenticated","email":email,"exp":int(time.time())+3600}).encode())
    s=b64(hmac.new(b"una-clave-de-prueba-de-al-menos-32-caracteres!!", f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"
print(jwt(sys.argv[1], sys.argv[2]))
