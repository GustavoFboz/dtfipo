"""CI only: an entirely invented PGDMP through real encrypted Windows restore logic.

Never supply owner backup, keys, network endpoints or clinical information.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import secrets
import sys
import time

from private_offsite_bundle import create_bundle
from local_staging_restore import (
    _docker, POSTGRES_IMAGE, POSTGRES_USERNAME, restore_database_locally,
)

def main():
    source_name="df-synthetic-source-"+secrets.token_hex(6)
    pull=_docker(["pull", POSTGRES_IMAGE],timeout=240)
    if pull.returncode:
        raise RuntimeError("DF_SYNTHETIC_PULL_FAILED")
    u=_docker(["run","--rm","--network","none","--entrypoint","id",POSTGRES_IMAGE,"-u","postgres"],timeout=20)
    g=_docker(["run","--rm","--network","none","--entrypoint","id",POSTGRES_IMAGE,"-g","postgres"],timeout=20)
    if u.returncode or g.returncode:
        raise RuntimeError("DF_SYNTHETIC_UID_FAILED")
    uid=u.stdout.decode("ascii").strip()
    gid=g.stdout.decode("ascii").strip()
    try:
        cmd=["run","-d","--name",source_name,
            "--network","none","--user","postgres","--cap-drop=ALL",
            "--security-opt","no-new-privileges","--pids-limit","256","--memory","1g",
            "--tmpfs",f"/var/lib/postgresql/data:rw,uid={uid},gid={gid},mode=0700,size=512m",
            "--tmpfs",f"/var/run/postgresql:rw,uid={uid},gid={gid},mode=0770,size=16m",
            "--tmpfs","/tmp:rw,mode=1777,size=64m",
            "-e","POSTGRES_HOST_AUTH_METHOD=trust",
            POSTGRES_IMAGE,"postgres","-c","config_file=/etc/postgresql/postgresql.conf"]
        start=_docker(cmd,timeout=90)
        if start.returncode:
            raise RuntimeError("DF_SYNTHETIC_SOURCE_START_FAILED")
        for i in range(45):
            ready=_docker(["exec",source_name,"pg_isready","-U",POSTGRES_USERNAME,"-d","postgres"],timeout=8)
            if ready.returncode==0:break
            time.sleep(1)
        else:
            raise RuntimeError("DF_SYNTHETIC_SOURCE_NOT_READY")
        fictitious=b"""
CREATE TABLE public.patients(id INTEGER PRIMARY KEY);
CREATE TABLE public.cases(id INTEGER PRIMARY KEY);
CREATE TABLE public.clinic_appointments(id INTEGER PRIMARY KEY);
CREATE TABLE public.storage_files(id INTEGER PRIMARY KEY);
INSERT INTO public.patients VALUES (1);
INSERT INTO public.cases VALUES (2);
INSERT INTO public.clinic_appointments VALUES (3);
INSERT INTO public.storage_files VALUES (4);
"""
        create=_docker(["exec","-i",source_name,"psql","-v","ON_ERROR_STOP=1",
                        "-U",POSTGRES_USERNAME,"-d","postgres","-q"],
                       data=fictitious,timeout=40)
        if create.returncode:
            raise RuntimeError("DF_SYNTHETIC_SOURCE_FIXTURE_FAILED")
        dump=_docker(["exec",source_name,"pg_dump","-Fc","-n","public",
                      "-U",POSTGRES_USERNAME,"-d","postgres"],timeout=80)
        if dump.returncode or not dump.stdout.startswith(b"PGDMP"):
            raise RuntimeError("DF_SYNTHETIC_ARCHIVE_FAILED")
        with TemporaryDirectory() as d:
            root=Path(d)
            source=root/"source"
            source.mkdir()
            (source/"fictitious.dump").write_bytes(dump.stdout)
            encrypted=root/"encrypted"
            private=root/"secret"/"key.bin"
            private.parent.mkdir()
            create_bundle(source,encrypted,private)
            result=restore_database_locally(encrypted,private)
            assert result["restored_patients"]==1
            assert result["restored_cases"]==1
            assert result["restored_appointments"]==1
            assert result["restored_storage_metadata_rows"]==1
            assert not result["integrated_database_storage_restore_verified"]
            assert not result["beta_release_authorized"]
        print("DF_SYNTHETIC_ENCRYPTED_PGDMP_DISPOSABLE_CLEAN_RESTORE_PASSED")
    finally:
        _docker(["rm","-f","-v",source_name],timeout=25)

if __name__=="__main__":
    try:
        main()
    except Exception:
        # Never emit SQL, stderr or source names even if this CI-only harness fails.
        print("DF_SYNTHETIC_PGDMP_TEST_FAILED",file=sys.stderr)
        raise SystemExit(1)
