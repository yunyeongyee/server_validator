"""Open the local browser tool; also used as the Windows packaging entrypoint."""
import argparse
import json
import os
import socket
import secrets
import sys
import urllib.request
import webbrowser
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description='Server Validator local mockup')
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if os.name=='nt':
        local_data=Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'AppData/Local')))/'ServerValidator'
        os.environ.setdefault('SERVER_VALIDATOR_DATA_DIR',str(local_data))
    import uvicorn
    from app.server import app
    from app.releases import release_info
    from app.runtime import write_runtime, clear_runtime
    root = Path(__file__).resolve().parent
    address=f'http://127.0.0.1:{args.port}'
    try:
        listener=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
        if os.name != 'nt':
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(('127.0.0.1',args.port))
    except OSError:
        try:
            with urllib.request.urlopen(address+'/api/health',timeout=2) as response: health=json.load(response)
            if health.get('app')=='server-validator':
                if health.get('release_id') != release_info(root).get('release_id', 'development'):
                    print('An older version is still running. Close its command window and run again.',file=sys.stderr)
                    raise SystemExit(1)
                if not args.no_browser: webbrowser.open(address)
                print('Server Validator is already running. Reusing the existing local instance.')
                return
        except (OSError,ValueError): pass
        print('Port is occupied. Close the existing program or use --port with another port.',file=sys.stderr)
        raise SystemExit(1)
    if args.port==0: address=f'http://127.0.0.1:{listener.getsockname()[1]}'
    print('Server Validator - local mockup')
    print('Only this PC can access this program. No domain or hosting is required.')
    print('Keep this window open. Press Ctrl+C to stop.')
    if not args.no_browser:
        import threading
        threading.Timer(1.0,lambda:webbrowser.open(address)).start()
    server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=args.port,access_log=False))
    token = secrets.token_urlsafe(32)
    app.state.control_token = token
    app.state.shutdown_callback = lambda: setattr(server, 'should_exit', True)
    write_runtime(root, listener.getsockname()[1], token)
    try: server.run(sockets=[listener])
    except KeyboardInterrupt: pass
    finally:
        listener.close()
        clear_runtime(root)


if __name__=='__main__': main()
