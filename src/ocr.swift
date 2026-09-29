import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    print("Usage: apple-vision-ocr <image_path>")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: url),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    print("Error: Could not load image from \(imagePath)")
    exit(1)
}

let request = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        if let err = error {
            fputs("Vision Error: \(err.localizedDescription)\n", stderr)
        }
        return
    }

    for observation in observations {
        if let candidate = observation.topCandidates(1).first {
            let box = observation.boundingBox
            // Format: string|confidence|x|y|w|h
            print("\(candidate.string)\t\(candidate.confidence)\t\(box.origin.x)\t\(box.origin.y)\t\(box.size.width)\t\(box.size.height)")
        }
    }
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["es-MX", "es-ES", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Handler Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}
