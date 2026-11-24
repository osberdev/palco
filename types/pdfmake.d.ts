// pdfmake 0.3 ships no types, and @types/pdfmake describes 0.2. Only what
// server/utils/ticket-pdf.ts uses is declared, according to js/index.js and
// src/base.js of the installed version.
declare module 'pdfmake' {
  interface OutputDocument {
    getBuffer(): Promise<Buffer>
  }

  interface FontFiles {
    readonly normal?: string
    readonly bold?: string
    readonly italics?: string
    readonly bolditalics?: string
  }

  interface PdfMake {
    readonly virtualfs: { writeFileSync(filename: string, content: Buffer): void }
    setFonts(fonts: Readonly<Record<string, FontFiles>>): void
    setUrlAccessPolicy(callback: (url: string) => boolean): void
    setLocalAccessPolicy(callback: (path: string) => boolean): void
    createPdf(docDefinition: object): OutputDocument
  }

  const pdfmake: PdfMake
  export default pdfmake
}
