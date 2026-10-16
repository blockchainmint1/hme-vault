import { isNative } from "@/lib/native/platform";

/** Save a text file: Documents folder on the phone, normal download in a browser. Returns where it went. */
export async function saveTextFile(name: string, text: string, type = "text/plain"): Promise<string> {
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({ path: name, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 });
    return `Documents/${name}`;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}
