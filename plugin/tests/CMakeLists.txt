add_executable(MIDItestTests
    test_smoke.cpp
    ../src/PluginProcessor.cpp
    ../src/PluginEditor.cpp)

juce_generate_juce_header(MIDItestTests)

target_include_directories(MIDItestTests PRIVATE ../src)
target_compile_definitions(MIDItestTests PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    MIDITEST_VERSION_STRING="0.1.0-alpha.1")
target_link_libraries(MIDItestTests PRIVATE
    juce::juce_audio_utils
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags)

add_test(NAME smoke COMMAND MIDItestTests)
