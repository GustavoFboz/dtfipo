import { describe, expect, it } from "vitest";
import { parsePrivateFileReference, privateFileReference } from "./private-file-reference";

const origin = "https://project.supabase.co";
describe("private storage references discard bearer authority", () => {
  it("reads a stable path without changing its encoding", () => {
    const value = privateFileReference("patient-files", "patient/arquivo com espaço.stl");
    expect(parsePrivateFileReference(value, origin)).toEqual({ bucket: "patient-files", path: "patient/arquivo com espaço.stl" });
  });
  it.each(["sign", "authenticated", "public"])("extracts a legacy %s path and ignores the token", (kind) => {
    expect(parsePrivateFileReference(`${origin}/storage/v1/object/${kind}/patient-photos/patient/foto%20antiga.jpg?token=old-secret`, origin))
      .toEqual({ bucket: "patient-photos", path: "patient/foto antiga.jpg" });
  });
  it("refuses another project's private URL", () => {
    expect(() => parsePrivateFileReference("https://other.supabase.co/storage/v1/object/sign/avatars/user/photo.jpg", origin))
      .toThrow("PRIVATE_FILE_ORIGIN_INVALID");
  });
  it.each(["../file", "patient/../file", "patient//file", "patient/\\file", "patient/file?token=secret", "patient/file\u0000.jpg"])
    ("refuses a malformed path %j", (path) => expect(() => privateFileReference("patient-files", path)).toThrow());
  it("does not expand the DICOM scope", () => {
    expect(() => parsePrivateFileReference("storage://dicom-files/patient/file.dcm", origin)).toThrow();
  });
  it("does not interpret an ordinary external avatar as Storage", () => {
    expect(parsePrivateFileReference("https://lh3.googleusercontent.com/avatar", origin)).toBeNull();
  });
});
