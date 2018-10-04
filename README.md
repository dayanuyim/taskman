- Using environment variable `task__cmd` to re-config the task command. Also, using the `${samplePath}` to get the sample file path in the disk. For example:

    1. task 執行 echo 指令
    
        ```
        `task__cmd`='echo The sample path is "${samplePath}"' \
        npm start
        ```
            
    2. task 執行 VA predict
    
        ```
        task__cmd='/path/to/ether-vul/main.py predict -s "${samplePath}"' \
        npm start
        ```
