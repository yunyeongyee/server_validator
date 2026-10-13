"""Open the local browser tool; also used as the Windows packaging entrypoint."""
import argparse
import json
import os
import sys
import urllib.request
import webbrowser
from pathlib import Path
from http.server import ThreadingHTTPServer


def main():
    parser=argparse.ArgumentParser(description='Server Validator local mockup')
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if os.name=='nt':
        local_data=Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'AppData/Local')))/'ServerValidator'
        os.environ.setdefault('SERVER_VALIDATOR_DATA_DIR',str(local_data))
    from app.server import Handler
    address=f'http://127.0.0.1:{args.port}'
    try:
        server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError:
        try:
            with urllib.request.urlopen(address+'/api/health',timeout=2) as response: health=json.load(response)
            if health.get('app')=='server-validator':
                if not args.no_browser: webbrowser.open(address)
                print('Server Validator is already running. Reusing the existing local instance.')
                return
        except (OSError,ValueError): pass
        print('Port is occupied. Close the existing program or use --port with another port.',file=sys.stderr)
        raise SystemExit(1)
    if args.port==0: address=f'http://127.0.0.1:{server.server_address[1]}'
    print('Server Validator - local mockup')
    print('Only this PC can access this program. No domain or hosting is required.')
    print('Keep this window open. Press Ctrl+C to stop.')
    if not args.no_browser: webbrowser.open(address)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__=='__main__': main()
