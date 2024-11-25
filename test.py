from libxmp import XMPFiles

xmp_file = XMPFiles(
    file_path="/home/barbara/glacier/db-of-objects-app/example_with_metadata(4).jpg",
    open_forupdate=False,
)
xmp = xmp_file.get_xmp()
xmp_file.close_file()

if xmp is not None:
    print("XMP Metadata:", xmp)
else:
    print("No XMP metadata found.")
