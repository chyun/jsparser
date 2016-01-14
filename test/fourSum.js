var fourSum = function(nums, target) {
	retStrs = {};
	rets = [];
	array = nums;
	sort(array);
	console.log(array);
	for (var i = 0; i < array.length - 3; i++) {
		if (i > 0 && array[i] == array[i-1])
                continue;
		for (var j = i + 1; j < array.length - 2; j++) {
			if (j > i + 1 && array[j] == array[j-1])
                continue;
            var k = j + 1;
            var t = array.length - 1;
			
			while(k < t)
            {
                if (k > j + 1 && array[k] == array[k-1])
                {
                    k++;
                    continue;
                }
                     
                if (t < array.length - 1 && array[t] == array[t+1])
                {
                    t--;
                    continue;
                }
                 
                var sum = array[i] + array[j] + array[k] + array[t];
                 
                if (sum == target) {
                    var ret = [];
                    ret.push(array[i]);
                    ret.push(array[j]);
                    ret.push(array[k]);
                    ret.push(array[t]);
                    rets.push(ret);
                    k++;
                } else if (sum < target)
                    k++;
                else
                    t--;                        
            }
		}
	}
	return rets;
};

var sort = function (nums) {
	quickSort(nums, 0, nums.length - 1);
}

var quickSort = function (nums, start, end) {
	if (start >= end) {
		return;
	}
	var s = start;
	var e = end;
	var pivot = start;
	var p = nums[pivot];
	//start = start + 1;
	while (start < end) {
		while (end > start && nums[end] >= p) {
			end--;
		}
		
		nums[pivot] = nums[end];
		pivot = end;
		while (start < end && nums[start] <= p) {
			start++;
		}
		
		nums[pivot] = nums[start];
		pivot = start;
		
	}
	nums[pivot] = p;
	//console.log();
	//console.log('end = ' + end);
	quickSort(nums, s, pivot - 1);
	quickSort(nums, pivot + 1, e);
	return nums;
}

