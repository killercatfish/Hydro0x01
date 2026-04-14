# type: ignore
Import("env")
import os

def auto_uploadfs(source, target, env):
    # Use env.subst() to translate the variable into a real path
    data_dir = env.subst("$PROJECTDATA_DIR")
    
    print(f"--- Checking for data in: {data_dir}")

    if os.path.exists(data_dir) and os.listdir(data_dir):
        print("--- LittleFS data detected. Triggering Uploadfs...")
        env.Execute("pio run -t uploadfs")
    else:
        print("--- No data files found in 'data' directory. Skipping.")

env.AddPreAction("upload", auto_uploadfs)