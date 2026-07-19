#!/usr/bin/env swift

import CoreImage
import Foundation

enum ColorKeyError: LocalizedError {
    case usage
    case inputMissing(String)
    case outputExists(String)
    case unreadableImage
    case missingFilter
    case missingOutput
    case missingColorSpace

    var errorDescription: String? {
        switch self {
        case .usage:
            return "Usage: color-key-image.swift <input-image> <output.png>"
        case .inputMissing(let path):
            return "Input image does not exist: \(path)"
        case .outputExists(let path):
            return "Output already exists: \(path)"
        case .unreadableImage:
            return "Could not decode the input image"
        case .missingFilter:
            return "Could not create Core Image color-cube filter"
        case .missingOutput:
            return "The color-cube filter did not return an image"
        case .missingColorSpace:
            return "Could not create the sRGB output color space"
        }
    }
}

func clamp(_ value: Float) -> Float {
    min(max(value, 0), 1)
}

func smoothstep(_ edge0: Float, _ edge1: Float, _ value: Float) -> Float {
    let progress = clamp((value - edge0) / (edge1 - edge0))
    return progress * progress * (3 - 2 * progress)
}

func removeMagentaKey(inputPath: String, outputPath: String) throws {
    let fileManager = FileManager.default
    let inputURL = URL(fileURLWithPath: inputPath).standardizedFileURL
    let outputURL = URL(fileURLWithPath: outputPath).standardizedFileURL

    guard fileManager.fileExists(atPath: inputURL.path) else {
        throw ColorKeyError.inputMissing(inputURL.path)
    }
    guard !fileManager.fileExists(atPath: outputURL.path) else {
        throw ColorKeyError.outputExists(outputURL.path)
    }
    guard let inputImage = CIImage(
        contentsOf: inputURL,
        options: [.applyOrientationProperty: true]
    ) else {
        throw ColorKeyError.unreadableImage
    }
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
        throw ColorKeyError.missingColorSpace
    }

    let dimension = 64
    var cube = [Float]()
    cube.reserveCapacity(dimension * dimension * dimension * 4)

    for blueIndex in 0..<dimension {
        let blue = Float(blueIndex) / Float(dimension - 1)
        for greenIndex in 0..<dimension {
            let green = Float(greenIndex) / Float(dimension - 1)
            for redIndex in 0..<dimension {
                let red = Float(redIndex) / Float(dimension - 1)

                // Pure magenta has strong red and blue with almost no green.
                // The excess remains useful for antialiased edge pixels where
                // the foreground color is blended with the key background.
                let magentaExcess = max(0, min(red, blue) - green)
                let alpha = 1 - smoothstep(0.02, 0.92, magentaExcess)

                if alpha < 0.015 {
                    cube.append(contentsOf: [0, 0, 0, 0])
                    continue
                }

                // Remove the magenta contribution before premultiplication so
                // translucent edges keep the subject color instead of a halo.
                let recoveredRed = clamp((red - (1 - alpha)) / alpha)
                let recoveredGreen = clamp(green / alpha)
                let recoveredBlue = clamp((blue - (1 - alpha)) / alpha)
                cube.append(contentsOf: [
                    recoveredRed * alpha,
                    recoveredGreen * alpha,
                    recoveredBlue * alpha,
                    alpha,
                ])
            }
        }
    }

    let cubeData = cube.withUnsafeBytes { Data($0) }
    guard let filter = CIFilter(name: "CIColorCubeWithColorSpace") else {
        throw ColorKeyError.missingFilter
    }
    filter.setValue(dimension, forKey: "inputCubeDimension")
    filter.setValue(cubeData, forKey: "inputCubeData")
    filter.setValue(inputImage, forKey: kCIInputImageKey)
    filter.setValue(colorSpace, forKey: "inputColorSpace")

    guard let outputImage = filter.outputImage?.cropped(to: inputImage.extent) else {
        throw ColorKeyError.missingOutput
    }
    let context = CIContext(options: [.cacheIntermediates: false])
    try context.writePNGRepresentation(
        of: outputImage,
        to: outputURL,
        format: .RGBA8,
        colorSpace: colorSpace
    )
}

do {
    guard CommandLine.arguments.count == 3 else {
        throw ColorKeyError.usage
    }
    try removeMagentaKey(
        inputPath: CommandLine.arguments[1],
        outputPath: CommandLine.arguments[2]
    )
    print("output=\(URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL.path)")
} catch {
    fputs("Error: \(error.localizedDescription)\n", stderr)
    exit(1)
}
