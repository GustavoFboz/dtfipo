// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachments = [
  {
    id: "image-1", patient_id: "patient-1", title: "Raio-X", description: null,
    kind: "xray", file_path: "patient-1/xray.png", file_url: "storage://patient-files/patient-1/xray.png",
    thumbnail_url: "storage://patient-files/patient-1/xray.png", mime_type: "image/png", size_bytes: 10,
  },
  {
    id: "document-1", patient_id: "patient-1", title: "Prontuário", description: null,
    kind: "document", file_path: "patient-1/document.pdf", file_url: "storage://patient-files/patient-1/document.pdf",
    thumbnail_url: null, mime_type: "application/pdf", size_bytes: 10,
  },
];

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: attachments }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  fetchPatientAttachments: vi.fn(),
  uploadPatientAttachment: vi.fn(),
  deletePatientAttachment: vi.fn(),
  refreshAttachmentSignedUrl: vi.fn(),
}));
vi.mock("@/components/PrivateImage", () => ({
  PrivateImage: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/Lightbox", () => ({
  Lightbox: ({ open, images, index }: any) => open ? (
    <div data-testid="lightbox">{images[index].name}|{images[index].url}</div>
  ) : null,
}));

import { PatientAttachments } from "./PatientAttachments";

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<PatientAttachments patientId="patient-1" />); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("PatientAttachments image previews", () => {
  it("opens the selected private image and does not turn documents into image previews", async () => {
    const documentPreview = container.querySelector('[aria-label="Ampliar imagem Prontuário"]');
    expect(documentPreview).toBeNull();

    const imagePreview = container.querySelector('[aria-label="Ampliar imagem Raio-X"]') as HTMLButtonElement;
    expect(imagePreview).not.toBeNull();
    await act(async () => { imagePreview.click(); });

    expect(container.querySelector('[data-testid="lightbox"]')?.textContent)
      .toBe("Raio-X|storage://patient-files/patient-1/xray.png");
  });
});
