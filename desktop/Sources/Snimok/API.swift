import Foundation

struct UploadResult: Decodable {
    let id: String
    let url: String
    let permalink_url: String
}

struct DeviceCode: Decodable {
    let code: String
    let verify_url: String
    let expires_in: Double
    let interval: Double
}

enum PollResult {
    case pending
    case ok(token: String)
    case expired
}

enum APIError: LocalizedError {
    case unauthorized
    case server(status: Int, message: String)
    case transport(Error)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "This device is not connected to an account."
        case .server(let status, let message): return "Server error \(status): \(message)"
        case .transport(let e): return e.localizedDescription
        case .badResponse: return "Unexpected response from server."
        }
    }
}

final class API {
    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 60
        cfg.waitsForConnectivity = true
        return URLSession(configuration: cfg)
    }()

    private var base: URL { Settings.serverURL }

    private func request(_ path: String, method: String, token: String?) -> URLRequest {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue(Settings.deviceId, forHTTPHeaderField: "X-Snimok-Device")
        req.setValue("Snimok-Mac/1.0", forHTTPHeaderField: "User-Agent")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return req
    }

    /// URL the browser should open: sets the device cookie, then redirects to `path`.
    func claimURL(next path: String) -> URL {
        var comps = URLComponents(url: base.appendingPathComponent("claim"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "device", value: Settings.deviceId),
            URLQueryItem(name: "next", value: path),
        ]
        return comps.url!
    }

    private func decodeError(_ data: Data?) -> String {
        guard let data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let msg = obj["error"] as? String else { return "" }
        return msg
    }

    // MARK: Upload

    func upload(file: URL, token: String?, fields: [String: String] = [:],
                completion: @escaping (Result<UploadResult, APIError>) -> Void) {
        guard let data = try? Data(contentsOf: file) else {
            completion(.failure(.badResponse)); return
        }
        let boundary = "SnimokBoundary\(UUID().uuidString)"
        var body = Data()
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append(value.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"imagedata\"; filename=\"screenshot.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        var req = request("api/upload", method: "POST", token: token)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body

        session.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                if let err { completion(.failure(.transport(err))); return }
                guard let http = resp as? HTTPURLResponse else { completion(.failure(.badResponse)); return }
                if http.statusCode == 401 { completion(.failure(.unauthorized)); return }
                guard (200..<300).contains(http.statusCode) else {
                    completion(.failure(.server(status: http.statusCode, message: self.decodeError(data)))); return
                }
                guard let data, let result = try? JSONDecoder().decode(UploadResult.self, from: data) else {
                    completion(.failure(.badResponse)); return
                }
                completion(.success(result))
            }
        }.resume()
    }

    // MARK: Device-code sign in

    func requestDeviceCode(completion: @escaping (Result<DeviceCode, APIError>) -> Void) {
        let req = request("api/desktop/code", method: "POST", token: nil)
        session.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                if let err { completion(.failure(.transport(err))); return }
                guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                      let data, let dc = try? JSONDecoder().decode(DeviceCode.self, from: data) else {
                    completion(.failure(.badResponse)); return
                }
                completion(.success(dc))
            }
        }.resume()
    }

    func poll(code: String, completion: @escaping (Result<PollResult, APIError>) -> Void) {
        var comps = URLComponents(url: base.appendingPathComponent("api/desktop/poll"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "code", value: code)]
        session.dataTask(with: comps.url!) { data, resp, err in
            DispatchQueue.main.async {
                if let err { completion(.failure(.transport(err))); return }
                guard let http = resp as? HTTPURLResponse else { completion(.failure(.badResponse)); return }
                if http.statusCode == 410 { completion(.success(.expired)); return }
                guard let data,
                      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let status = obj["status"] as? String else {
                    completion(.failure(.badResponse)); return
                }
                switch status {
                case "ok":
                    if let token = obj["token"] as? String { completion(.success(.ok(token: token))) }
                    else { completion(.failure(.badResponse)) }
                case "pending": completion(.success(.pending))
                default: completion(.success(.expired))
                }
            }
        }.resume()
    }
}
