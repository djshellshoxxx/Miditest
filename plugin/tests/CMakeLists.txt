function(miditest_add_test target test_name)
    add_executable(${target} ${ARGN})
    juce_generate_juce_header(${target})
    target_include_directories(${target} PRIVATE ../src)
    target_compile_features(${target} PRIVATE cxx_std_20)
    target_compile_definitions(${target} PRIVATE
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        MIDITEST_VERSION_STRING="0.1.0-alpha.1")
    target_link_libraries(${target} PRIVATE
        juce::juce_audio_utils
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)
    add_test(NAME ${test_name} COMMAND ${target})
endfunction()

miditest_add_test(MIDItestTests smoke
    test_smoke.cpp
    ../src/PluginProcessor.cpp
    ../src/PluginEditor.cpp
    ../src/core/MidiMessageDecoder.cpp)

miditest_add_test(MIDItestDecoderTests decoder
    test_decoder.cpp
    ../src/core/MidiMessageDecoder.cpp)

miditest_add_test(MIDItestControlTests controls
    test_controls.cpp
    ../src/core/ControlAnalyzer.cpp)

miditest_add_test(MIDItestPitchTests pitch
    test_pitch.cpp
    ../src/core/PitchAnalyzer.cpp)

miditest_add_test(MIDItestClockTests clock
    test_clock.cpp
    ../src/core/ClockAnalyzer.cpp)

miditest_add_test(MIDItestProcessorTests processor
    test_processor.cpp
    ../src/PluginProcessor.cpp
    ../src/PluginEditor.cpp
    ../src/core/MidiMessageDecoder.cpp)

miditest_add_test(MIDItestSessionTests session
    test_session.cpp
    ../src/core/SessionModel.cpp
    ../src/core/ControlAnalyzer.cpp
    ../src/core/PitchAnalyzer.cpp
    ../src/core/ClockAnalyzer.cpp)
