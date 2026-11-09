"""Independent reader: verify real IPC compression and exact logical/schema equality."""
import os
from pathlib import Path
import pyarrow.ipc as ipc
folder=Path(os.environ['LENS_COMPRESSION_FIXTURES_DIR'])
expected=ipc.open_stream(folder/'expected.arrow').read_all()
for codec in ['lz4','zstd']:
    actual=ipc.open_stream(folder/f'{codec}.arrow').read_all()
    assert actual.schema.equals(expected.schema,check_metadata=True),codec
    assert actual.equals(expected),codec
    assert actual.column('big')[0].as_py()==9007199254740993,codec
    print(f'{codec}: PyArrow read {actual.num_rows} rows; exact schema and values match, including BIGINT > 2^53')
