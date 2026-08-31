public protocol RuntimeEventSource: Sendable {
    func facts() -> AsyncStream<RuntimeFact>
}
